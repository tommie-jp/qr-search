// OCR の実体を載せる Web Worker (docs/24-画像OCR計画.md §9-1)。
//
// PaddleOCR 公式ブラウザ SDK (OpenCV.js 内蔵) + onnxruntime-web + モデル 21MB を
// **この realm の中だけ**で抱える。メインスレッドから terminate すれば realm ごと
// 消えるので、確保した wasm ヒープが OS へ返る。
//
// **なぜ realm ごと捨てる必要があるか**: WebAssembly.Memory は grow しかできず、
// SDK の dispose() で ORT セッションを release してもヒープの高水位は縮まない。
// メインスレッドで OCR を実行していた頃は、編集画面を離れても数百 MB がタブに
// 残り続け、後から開いた画像検索がモデルを積めずに落ちていた (実機 iPhone)。
// dispose() だけでは足りず、むしろ作り直しでヒープが伸びて悪化した (v0.18.0)。
//
// **SDK の worker モードを使わない理由**: SDK 自身も worker: true を持つが、
// そちらは自前 fetch を渡せず、モデル DL の進捗 % が出せなくなる。自前 Worker
// なら fetch はこの realm のものをそのまま使えるので、% は postMessage で
// メインスレッドへ中継できる。
//
// 副次効果として、認識中もメインスレッドは空いたままになる。

/// <reference lib="webworker" />

import { type CaptureScope, installClientLogCapture } from '@/lib/clientLogCapture'
import { sendClientLogs } from '@/lib/clientLogTransport'
import { formatOcrQuote } from '@/lib/ocr/ocrQuote'
import { orderOcrItems } from '@/lib/ocr/orderOcrItems'
import { quietOrtSessionLogs } from '@/lib/ort/quietOrtLogs'
import { aggregatePercent } from '@/lib/progress'
import { createProgressFetch } from '@/lib/progressFetch'
import type { FromOcrWorker, ToOcrWorker } from './ocrWorkerMessages'

const ctx = self as unknown as DedicatedWorkerGlobalScope

// **SDK を Worker で動かすための最小の shim**。
//
// SDK の bitmapToSourceMat は認識のたびに `document.createElement("canvas")` を
// 呼び、そこに描いてから cv.imread に渡す。この 1 行だけが DOM を必要とし、
// Worker では ReferenceError: document is not defined で落ちる (実測)。
//
// 代わりに OffscreenCanvas を返す。これで足りる根拠:
//   - SDK 自身の worker モード (dist/assets/worker-entry-*.js) が同じ変換を
//     `new OffscreenCanvas(w, h)` で行っている = 上流が想定している経路
//   - 同梱の OpenCV.js は imread で `img instanceof OffscreenCanvas` を分岐して
//     受け付ける
//   - SDK が canvas に対して使うのは width/height・getContext('2d')・drawImage
//     だけで、いずれも OffscreenCanvas にある
//
// SDK 自身の worker モード (worker: true) を使わないのは、あちらが自前 fetch を
// 受け取れず**モデル DL の進捗 % が出せなくなる**ため (ocrService の冒頭参照)。
// canvas 以外の要素を求められたら、想定と違う経路に入った合図なので落とす。
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
  ;(globalThis as { document?: unknown }).document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`OCR Worker では <${tagName}> を作れません`)
      }
      return new OffscreenCanvas(1, 1)
    },
  }
}

// 同梱 OpenCV.js の imread は `img instanceof HTMLImageElement` を先に見てから
// OffscreenCanvas の分岐に落ちる。Worker には HTMLImageElement が無いので
// instanceof の時点で ReferenceError になる (実測)。**渡すのは常に
// OffscreenCanvas なので、false になりさえすればよい**。素の class を置いて
// 分岐を素通りさせる
for (const name of ['HTMLImageElement', 'HTMLCanvasElement'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[name] === 'undefined') {
    ;(globalThis as Record<string, unknown>)[name] = class {}
  }
}

// Worker の console はどこにも出ないまま消える (docs/30-ブラウザログ計画.md §3)。
// モデル読み込みの失敗はこの中で起きるので、embedWorker と同じ拾い手を掛ける
installClientLogCapture({
  scope: ctx as unknown as CaptureScope,
  send: sendClientLogs,
})

// onnxruntime-web は既定で .wasm を CDN から取りに行く。自前配布した
// public/onnxruntime/ を指して外部依存を断つ (scripts/copyOnnxWasm.mjs)。
const WASM_BASE_PATH = '/onnxruntime/'

// 日本語を含む統合モデル (PP-OCRv5 mobile)。日本語優先は認識後の正規化
// (normalizeToJapanese) で寄せる ②方式 (docs/24 §2)。
//
// SDK の既定は百度の CDN からモデルを直接取るが、そこは CORS ヘッダを返さず
// **ブラウザからは弾かれる** (実機で確認)。自前配布に差し替える
// (scripts/fetchPaddleOcrModels.mjs が public/paddle-ocr/ へ落とす)。
// モデル名は tar 内 inference.yml の model_name と一致していないと
// 初期化時に弾かれるので、スクリプト側のファイル名と対で変える。
const DET_MODEL_NAME = 'PP-OCRv5_mobile_det'
const REC_MODEL_NAME = 'PP-OCRv5_mobile_rec'
const MODEL_BASE_PATH = '/paddle-ocr/'

// モデル tar 2 本の合計バイト数 (det 4,843,520 + rec 16,701,440)。
// Content-Length が取れないときの進捗 % の分母に使う。モデルを差し替える
// ときは scripts/fetchPaddleOcrModels.mjs と対でここも更新する
// (ずれても % の見た目が狂うだけで動作には影響しない)
const MODEL_TOTAL_BYTES_FALLBACK = 21_544_960

// OCR に渡す画像の長辺の上限。アップロード保存は実質原寸 (webp の上限
// 16383px のみ) なので、iPhone の 12〜48MP 写真がそのまま入り得る。
// OpenCV の行列は「幅×高さ×4 バイト」を何面も持つため、原寸のまま通すと
// iOS WebKit のメモリ上限を超える。長辺 2048px なら行列 1 面 16MB 程度で、
// ラベル・書籍ページの印刷文字には足りる
const MAX_OCR_SIDE = 2048

type SdkModule = typeof import('@paddleocr/paddleocr-js')
type OcrService = Awaited<ReturnType<SdkModule['PaddleOCR']['create']>>

// この realm で 1 度だけ初期化する。realm ごと捨てるのがメインスレッドの
// 解放手段なので、ここに「捨てる」仕組みは要らない
let servicePromise: Promise<OcrService> | null = null

function post(message: FromOcrWorker): void {
  ctx.postMessage(message)
}

// モデル由来の ORT 警告で /logs と eruda が埋まるのを止める。
// 理由と仕組みは quietOrtLogs.ts に書いた。**セッションを作る前に**呼ぶこと。
async function quietenOrtWarnings(): Promise<void> {
  const ort = await import('onnxruntime-web')
  quietOrtSessionLogs(ort)
}

async function initService(): Promise<OcrService> {
  await quietenOrtWarnings()
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js')

  const service = await PaddleOCR.create({
    textDetectionModelName: DET_MODEL_NAME,
    textDetectionModelAsset: { url: `${MODEL_BASE_PATH}${DET_MODEL_NAME}.tar` },
    textRecognitionModelName: REC_MODEL_NAME,
    textRecognitionModelAsset: { url: `${MODEL_BASE_PATH}${REC_MODEL_NAME}.tar` },
    // モデル tar の受信バイトを数えて DL 進捗 % を流す。aggregatePercent は
    // 99 で頭打ちし、create の解決 (呼び手の ready) が真の完了
    fetch: createProgressFetch((downloads) =>
      post({
        type: 'model-progress',
        percent: aggregatePercent(downloads, MODEL_TOTAL_BYTES_FALLBACK),
      }),
    ),
    ortOptions: {
      // wasm に固定する。'auto' は WebGPU が見えると WebGPU を選ぶが、
      // iOS WebKit の WebGPU はメモリを余分に食い、挙動もまだ枯れていない
      backend: 'wasm',
      wasmPaths: WASM_BASE_PATH,
    },
  })
  return service
}

function getService(): Promise<OcrService> {
  if (!servicePromise) {
    servicePromise = initService()
  }
  return servicePromise
}

// 初回のモデル読み込み。落ちたら理由をそのまま返す (握りつぶすと UI が原因を
// 言えなくなる)。失敗した promise は捨てて、次の要求で取り直せるようにする
async function preload(): Promise<void> {
  try {
    await getService()
    post({ type: 'ready' })
  } catch (err) {
    servicePromise = null
    post({ type: 'load-error', message: String(err) })
  }
}

// 大きすぎる画像を OCR 用に縮める。上限以下ならそのまま返す。
async function toOcrBitmap(blob: Blob): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(blob)
  const side = Math.max(bitmap.width, bitmap.height)
  if (side <= MAX_OCR_SIDE) {
    return bitmap
  }
  const scale = MAX_OCR_SIDE / side
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: 'high',
  })
  bitmap.close()
  return resized
}

// 画像 1 枚を OCR し、日本語優先で整えた引用ブロックを返す。
// 文字が取れなければ空文字 (呼び手はこれを「見つからなかった」に使う)。
async function runOcr(blob: Blob): Promise<string> {
  const service = await getService()

  // 原寸ではなく縮小した ImageBitmap を渡す (MAX_OCR_SIDE の理由を参照)。
  // 返るのは入力 1 枚につき 1 要素の配列。
  //
  // 検出段はさらに長辺 960 まで縮めて掛ける (PP-OCR の伝統的な既定)。
  // SDK の既定 (短辺 64 以上・上限 4000) は大きな文字で検出が細切れになる
  // (拡大画像の実測: 1 文字が複数の断片に割れて読み順も壊れた)。
  // 認識段は縮小前の切り抜きを使うので、小さな文字の画質は落ちない
  const bitmap = await toOcrBitmap(blob)
  try {
    const [result] = await service.predict(bitmap, {
      text_det_limit_side_len: 960,
      text_det_limit_type: 'max',
    })
    if (!result) {
      return ''
    }
    // items は検出器の出力順なので、読み順 (縦書きなら右→左) に並べ替えてから
    // 引用ブロックへ整形する。
    return formatOcrQuote(orderOcrItems(result.items))
  } finally {
    bitmap.close()
  }
}

ctx.onmessage = async (event: MessageEvent<ToOcrWorker>) => {
  const msg = event.data

  if (msg.type === 'preload') {
    await preload()
    return
  }

  // type === 'ocr'
  try {
    const quote = await runOcr(msg.blob)
    // 初回の読み込みを兼ねた要求なら、これが ready の合図にもなる
    post({ type: 'ready' })
    post({ type: 'result', id: msg.id, quote })
  } catch (err) {
    // 初期化に失敗していれば次の要求で取り直せるようにする。1 枚だけの失敗
    // (壊れた画像など) なら service は生きているので捨てない
    if (!(await isServiceAlive())) {
      servicePromise = null
    }
    post({ type: 'error', id: msg.id, message: String(err) })
  }
}

// service が使える状態か。初期化そのものが落ちている場合を見分ける
async function isServiceAlive(): Promise<boolean> {
  if (!servicePromise) {
    return false
  }
  try {
    await servicePromise
    return true
  } catch {
    return false
  }
}
