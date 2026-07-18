// クライアントサイド OCR の実体 (docs/24-画像OCR計画.md §1-3)。
//
// PaddleOCR 公式ブラウザ SDK (@paddleocr/paddleocr-js) の PP-OCRv5 を
// onnxruntime-web で実行する。画像はサーバへ再送しない。重い依存
// (SDK + OpenCV.js + モデル) はページ表示では読まず、最初に OCR を実行する
// ときだけ動的 import で取り込む。2 回目以降はブラウザの HTTP キャッシュ /
// メモリ上の singleton が効く。
//
// **公式 SDK を使う理由 (縦書き)**: 以前使っていた ppu-paddle-ocr は検出した
// 矩形をそのまま認識にかけるため、日本語の縦書きがほぼ読めなかった。公式 SDK は
// 公式パイプラインと同じく「縦横比 1.5 以上のクロップは 90 度回してから認識」を
// 実装しており、縦書きの列を認識できる。
//
// このモジュールはブラウザでのみ呼ぶ (createImageBitmap / WebAssembly を使う)。
// サーバ側からは絶対に import しないこと。

import { formatOcrQuote } from '@/lib/ocr/ocrQuote'
import { orderOcrItems } from '@/lib/ocr/orderOcrItems'

// onnxruntime-web は既定で .wasm を CDN から取りに行く。自前配布した
// public/onnxruntime/ を指して外部依存を断つ (scripts/copyOnnxWasm.mjs)。
const WASM_BASE_PATH = '/onnxruntime/'

// 日本語を含む統合モデル (PP-OCRv5 mobile)。日本語優先は認識後の正規化
// (normalizeToJapanese) で寄せる ②方式 (docs/24 §2)。PP-OCRv5 は公式デモで
// 実画像の縦書きが読めることを確認した版なので、これを既定にする。
//
// SDK の既定は百度の CDN からモデルを直接取るが、そこは CORS ヘッダを返さず
// **ブラウザからは弾かれる** (実機で確認)。自前配布に差し替える
// (scripts/fetchPaddleOcrModels.mjs が public/paddle-ocr/ へ落とす)。
// モデル名は tar 内 inference.yml の model_name と一致していないと
// 初期化時に弾かれるので、スクリプト側のファイル名と対で変える。
const DET_MODEL_NAME = 'PP-OCRv5_mobile_det'
const REC_MODEL_NAME = 'PP-OCRv5_mobile_rec'
const MODEL_BASE_PATH = '/paddle-ocr/'

type SdkModule = typeof import('@paddleocr/paddleocr-js')
type OcrService = Awaited<ReturnType<SdkModule['PaddleOCR']['create']>>

// 初期化は 1 度だけ。複数の画像を続けて OCR しても使い回す。
let servicePromise: Promise<OcrService> | null = null
let ready = false

async function createService(): Promise<OcrService> {
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js')

  const service = await PaddleOCR.create({
    textDetectionModelName: DET_MODEL_NAME,
    textDetectionModelAsset: { url: `${MODEL_BASE_PATH}${DET_MODEL_NAME}.tar` },
    textRecognitionModelName: REC_MODEL_NAME,
    textRecognitionModelAsset: { url: `${MODEL_BASE_PATH}${REC_MODEL_NAME}.tar` },
    ortOptions: {
      // WebGPU が使える端末では速い。使えなければ SDK 側で wasm に落ちる。
      backend: 'auto',
      wasmPaths: WASM_BASE_PATH,
    },
  })
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

  // predict は Blob をそのまま受け取れる。返るのは入力 1 枚につき 1 要素の配列。
  const [result] = await service.predict(blob)
  if (!result) {
    return ''
  }

  // items は検出器の出力順なので、読み順 (縦書きなら右→左) に並べ替えてから
  // 引用ブロックへ整形する。
  return formatOcrQuote(orderOcrItems(result.items))
}
