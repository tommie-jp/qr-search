// クライアントサイド OCR の実体 (docs/24-画像OCR計画.md §1-3)。
//
// ppu-paddle-ocr の PP-OCRv6 統合モデル (日本語対応) を onnxruntime-web で
// ブラウザ内実行する。画像はサーバへ再送しない。重い依存 (onnxruntime-web +
// モデル) はページ表示では読まず、最初に OCR を実行するときだけ動的 import で
// 取り込む。2 回目以降はブラウザの HTTP キャッシュ / メモリ上の singleton が効く。
//
// このモジュールはブラウザでのみ呼ぶ (createImageBitmap / canvas / WebAssembly
// を使う)。サーバ側からは絶対に import しないこと。

import { formatOcrQuote } from '@/lib/ocr/ocrQuote'

// onnxruntime-web は既定で .wasm を CDN から取りに行く。自前配布した
// public/onnxruntime/ を指して外部依存を断つ (scripts/copyOnnxWasm.mjs)。
const WASM_BASE_PATH = '/onnxruntime/'

// PaddleOcrService の型だけ先に取り込む (実体は動的 import)。
type WebOcrModule = typeof import('ppu-paddle-ocr/web')
type OcrService = InstanceType<WebOcrModule['PaddleOcrService']>

// 初期化は 1 度だけ。複数の画像を続けて OCR しても使い回す。
let servicePromise: Promise<OcrService> | null = null
let ready = false

async function createService(): Promise<OcrService> {
  // onnxruntime-web と web エントリを動的に取り込む。両者は同じ ort インスタンスを
  // 参照するので、ここで wasmPaths を差せば初期化前に間に合う。
  const [ort, web] = await Promise.all([
    import('onnxruntime-web'),
    import('ppu-paddle-ocr/web'),
  ])
  ort.env.wasm.wasmPaths = WASM_BASE_PATH

  // モデルは既定 (V6 small = 日本語を含む統合モデル)。日本語優先は認識後の
  // 正規化 (normalizeToJapanese) で寄せる ②方式 (docs/24 §2)。
  const service = new web.PaddleOcrService()
  await service.initialize()
  ready = true
  return service
}

// 初回のモデル読み込みが済んでいるか。UI が「準備中(初回)」と「処理中」を
// 出し分けるのに使う。
export function isOcrReady(): boolean {
  return ready
}

// 初回ロードを前もって温めたいとき用 (今は未使用だが、編集画面を開いた時点で
// 走らせる導線を足せるようにしておく)。
export function preloadOcr(): void {
  if (!servicePromise) {
    servicePromise = createService()
  }
}

// 画像 1 枚を OCR し、日本語優先で整えた引用ブロックを返す。
// 文字が取れなければ空文字を返す (呼び手はこれを「見つからなかった」に使う)。
export async function ocrImageToQuote(blob: Blob): Promise<string> {
  if (!servicePromise) {
    servicePromise = createService()
  }
  const service = await servicePromise

  // Blob → ImageBitmap → canvas。recognize は canvas を受け付ける。
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('canvas の 2D コンテキストを取得できませんでした')
    }
    ctx.drawImage(bitmap, 0, 0)

    const result = await service.recognize(canvas)
    return formatOcrQuote(result.text)
  } finally {
    bitmap.close()
  }
}
