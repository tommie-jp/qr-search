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
import { quietOrtSessionLogs } from '@/lib/ort/quietOrtLogs'
import { orderOcrItems } from '@/lib/ocr/orderOcrItems'
import { aggregatePercent } from '@/lib/progress'
import { createProgressFetch } from '@/lib/progressFetch'

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

// モデル tar 2 本の合計バイト数 (det 4,843,520 + rec 16,701,440)。
// Content-Length が取れないときの進捗 % の分母に使う。モデルを差し替える
// ときは scripts/fetchPaddleOcrModels.mjs と対でここも更新する
// (ずれても % の見た目が狂うだけで動作には影響しない)
const MODEL_TOTAL_BYTES_FALLBACK = 21_544_960

// 「モデルの準備が終わった」の合図。バイト計は 99 で頭打ちにしてあるので、
// この値だけが完了 (成功・失敗を問わず購読者が表示を畳んでよい) を意味する
export const MODEL_READY_PERCENT = 100

// OCR に渡す画像の長辺の上限。アップロード保存は実質原寸 (webp の上限
// 16383px のみ) なので、iPhone の 12〜48MP 写真がそのまま入り得る。
// OpenCV の行列は「幅×高さ×4 バイト」を何面も持つため、原寸のまま通すと
// iOS WebKit のタブ上限を超えて**ページごと再起動**する (エディタの内容が
// 消えたように見える)。長辺 2048px なら行列 1 面 16MB 程度で、ラベル・
// 書籍ページの印刷文字には足りる
const MAX_OCR_SIDE = 2048

type SdkModule = typeof import('@paddleocr/paddleocr-js')
type OcrService = Awaited<ReturnType<SdkModule['PaddleOCR']['create']>>

// モデル由来の ORT 警告で /logs と eruda が埋まるのを止める。
// 理由と仕組みは quietOrtLogs.ts に書いた。**セッションを作る前に**呼ぶこと。
//
// SDK が内部で import する onnxruntime-web と、ここで import するものは
// 同じインスタンス (SDK は onnxruntime-web を入れ子に持たず、巻き上げられた
// 1 つを共有する)。だからここで包めば SDK のセッションにも効く
async function quietenOrtWarnings(): Promise<void> {
  const ort = await import('onnxruntime-web')
  quietOrtSessionLogs(ort)
}

// 初期化は 1 度だけ。複数の画像を続けて OCR しても使い回す。
let servicePromise: Promise<OcrService> | null = null
let ready = false

// モデルダウンロードの進捗 % の購読者 (バナー表示用)。service が singleton
// なので進捗のチャネルもモジュールに 1 本でよい
let modelProgressListeners: readonly ((percent: number) => void)[] = []

// 直前に通知した %。チャンク到着ごとに同じ整数を流すと購読者 (React state)
// が無駄に再描画されるため、値が変わったときだけ通知する
let lastNotifiedPercent: number | null = null

// モデル DL の % を購読する。戻り値で解除。MODEL_READY_PERCENT が
// 「準備終了」の合図 (DL 完了後の展開・ORT 初期化が残るため、
// バイト数だけでは 100 にしない)
export function subscribeModelProgress(
  listener: (percent: number) => void,
): () => void {
  modelProgressListeners = [...modelProgressListeners, listener]
  return () => {
    modelProgressListeners = modelProgressListeners.filter((l) => l !== listener)
  }
}

function notifyModelProgress(percent: number): void {
  if (percent === lastNotifiedPercent) {
    return
  }
  lastNotifiedPercent = percent
  for (const listener of modelProgressListeners) {
    listener(percent)
  }
}

async function createService(): Promise<OcrService> {
  try {
    return await initService()
  } catch (e) {
    // 失敗したことも購読者へ伝える。伝えないと「準備しています… 47%」の
    // バナーが永久に残る (バイト計は 99 止まりで完了に届かないため)
    notifyModelProgress(MODEL_READY_PERCENT)
    throw e
  }
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
    // 99 で頭打ちし、create の解決 (下の notifyModelProgress(100)) が真の完了
    fetch: createProgressFetch((downloads) =>
      notifyModelProgress(aggregatePercent(downloads, MODEL_TOTAL_BYTES_FALLBACK)),
    ),
    ortOptions: {
      // wasm に固定する。'auto' は WebGPU が見えると WebGPU を選ぶが、
      // iOS WebKit の WebGPU はメモリを余分に食い、挙動もまだ枯れていない。
      // 画像検索の embedder と同じ「WASM で動くのが基準性能」の方針に合わせ、
      // 全端末で同じ経路を踏む (PC の高速化は必要になってから戻す)
      backend: 'wasm',
      wasmPaths: WASM_BASE_PATH,
    },
  })
  ready = true
  notifyModelProgress(MODEL_READY_PERCENT)
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
// 文字が取れなければ空文字を返す (呼び手はこれを「見つからなかった」に使う)。
//
// **認識中の進捗 % は出せない**: SDK が進捗を通知しないうえ、onnxruntime-web
// の推論はメインスレッドを同期的に占有するため、経過時間から擬似進捗を作って
// setInterval で流しても 1 度も発火しない (実測: 1.8 秒の認識中にティック 0 回。
// state を変えても再描画自体が走らない)。% を出すには OCR を Web Worker へ
// 移す必要があり、SDK の worker モードは自前 fetch と併用できない
// = モデル DL の進捗 % と両立しない。ここでは進捗の通知はしない。
export async function ocrImageToQuote(blob: Blob): Promise<string> {
  if (!servicePromise) {
    servicePromise = createService()
  }
  let service: OcrService
  try {
    service = await servicePromise
  } catch (e) {
    // 失敗した promise を握り続けると以後の OCR が全部即失敗する。
    // 捨てておけば次回は取り直せる (回線が戻れば読める)
    servicePromise = null
    throw e
  }

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
