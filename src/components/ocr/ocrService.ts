// クライアントサイド OCR のメインスレッド側の窓口 (docs/24-画像OCR計画.md §9-1)。
//
// 実体 (SDK + OpenCV.js + onnxruntime + モデル) は ocrWorker.ts の中だけに置き、
// ここは Worker を 1 つ抱えて要求と応答を Promise で対応づけるだけ。画像は
// サーバへ再送しない。
//
// **なぜ Worker か (メモリ)**: 以前はメインスレッドで SDK を直接動かしていたが、
// WebAssembly.Memory は grow しかできないため、確保した数百 MB がタブに残り
// 続けた。SPA 遷移では realm が変わらないので編集画面を離れても解放されず、
// 後から開いた画像検索がモデルを積めずに落ちていた (実機 iPhone)。SDK の
// dispose() では ORT セッションを release してもヒープの高水位は縮まず、むしろ
// 作り直しで伸びて悪化した (v0.18.0 で実証)。**terminate して realm ごと捨てる**
// のが唯一メモリを OS へ返す方法なので、そのために Worker へ移した。
//
// **公式 SDK を使う理由 (縦書き)**: 以前使っていた ppu-paddle-ocr は検出した
// 矩形をそのまま認識にかけるため、日本語の縦書きがほぼ読めなかった。公式 SDK は
// 公式パイプラインと同じく「縦横比 1.5 以上のクロップは 90 度回してから認識」を
// 実装しており、縦書きの列を認識できる (docs/24 §2)。
//
// このモジュールはブラウザでのみ呼ぶ。サーバ側からは絶対に import しないこと。

import { logDiagEvent } from '@/lib/diagLog'
import type { FromOcrWorker, ToOcrWorker } from './ocrWorkerMessages'

// 「モデルの準備が終わった」の合図。バイト計は 99 で頭打ちにしてあるので、
// この値だけが完了 (成功・失敗を問わず購読者が表示を畳んでよい) を意味する
export const MODEL_READY_PERCENT = 100

interface Pending {
  resolve: (quote: string) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let ready = false
const pending = new Map<number, Pending>()
let nextId = 1

// Worker を起こした時刻 (performance.now)。準備完了までの秒数を診断ログに出す
let spawnedAt: number | null = null

// モデルダウンロードの進捗 % の購読者 (バナー表示用)。Worker は 1 本なので
// 進捗のチャネルもモジュールに 1 本でよい
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

// 未解決の要求をまとめて落とす。放っておくと呼び手が永遠に待つ
function rejectPending(reason: string): void {
  for (const entry of pending.values()) {
    entry.reject(new Error(reason))
  }
  pending.clear()
}

function handleMessage(msg: FromOcrWorker): void {
  if (msg.type === 'model-progress') {
    notifyModelProgress(msg.percent)
    return
  }
  if (msg.type === 'ready') {
    if (!ready) {
      // ready は OCR のたびに届くが、診断に要るのは初回 (モデル準備) だけ
      logDiagEvent(`[OCR] モデル準備完了 (${elapsedSec()}秒)`)
    }
    ready = true
    notifyModelProgress(MODEL_READY_PERCENT)
    return
  }
  if (msg.type === 'load-error') {
    // /logs へも残す (warn)。UI のエラー表示はページ遷移で消えるが、
    // 実機調査ではこれが唯一の手掛かりになる
    console.warn('OCR モデルを読み込めませんでした', msg.message)
    // 準備バナーを畳ませる。伝えないと「準備しています… 47%」が永久に残る
    // (バイト計は 99 止まりで完了に届かないため)
    notifyModelProgress(MODEL_READY_PERCENT)
    rejectPending(msg.message)
    return
  }
  const entry = pending.get(msg.id)
  if (!entry) {
    return
  }
  pending.delete(msg.id)
  if (msg.type === 'result') {
    entry.resolve(msg.quote)
    return
  }
  entry.reject(new Error(msg.message))
}

// Worker 起動からの経過秒 (表示用に 1 桁で丸める)
function elapsedSec(): string {
  if (spawnedAt === null) {
    return '?'
  }
  return ((performance.now() - spawnedAt) / 1000).toFixed(1)
}

function getWorker(): Worker {
  if (worker) {
    return worker
  }
  logDiagEvent('[OCR] Worker 起動')
  spawnedAt = performance.now()
  const created = new Worker(new URL('./ocrWorker.ts', import.meta.url), {
    type: 'module',
  })
  created.onmessage = (event: MessageEvent<FromOcrWorker>) => {
    handleMessage(event.data)
  }
  // Worker 自体が起動できない (チャンクの 404、import の失敗など) と onmessage は
  // 一生呼ばれない。拾わないと「準備しています」で固まる
  created.onerror = (event: ErrorEvent) => {
    notifyModelProgress(MODEL_READY_PERCENT)
    rejectPending(event.message || 'OCR を起動できませんでした')
  }
  worker = created
  return created
}

// 初回のモデル読み込みが済んでいるか。UI が「準備中」と「処理中」を
// 出し分けるのに使う。
export function isOcrReady(): boolean {
  return ready
}

// 初回ロードを前もって温めたいとき用 (今は未使用だが、編集画面を開いた時点で
// 走らせる導線を足せるようにしておく)。
export function preloadOcr(): void {
  getWorker().postMessage({ type: 'preload' } satisfies ToOcrWorker)
}

// OCR の Worker を落とし、抱えていたメモリを OS へ返す。
//
// 編集画面を離れるとき (MemoEditorInner) と、画像検索を開くとき
// (ImageSearchModal) に呼ぶ。**terminate は realm ごと捨てる**ので、
// OpenCV と onnxruntime が確保した wasm ヒープがまるごと返る
// (SDK の dispose() では縮まなかった。冒頭のコメント参照)。
//
// 走っている OCR があっても待たない: 呼ぶのは編集画面が閉じた後か、
// メモリを空けたい画像検索の直前で、どちらも結果の行き先が無い。
// 待っている呼び手には理由を伝えて落とす。
//
// reason は診断ログに出す「なぜ落としたか」(例: '編集画面を離脱')。
// 実機調査で「画像検索の前に OCR は本当に死んでいたか」を /logs で
// 証明するのに要る。
export function disposeOcr(reason: string): void {
  if (!worker) {
    return
  }
  logDiagEvent(`[OCR] Worker 破棄 (${reason})`)
  worker.terminate()
  worker = null
  ready = false
  spawnedAt = null
  lastNotifiedPercent = null
  rejectPending('OCR を終了しました')
}

// 画像 1 枚を OCR し、日本語優先で整えた引用ブロックを返す。
// 文字が取れなければ空文字を返す (呼び手はこれを「見つからなかった」に使う)。
//
// 認識は Worker の中で走るので、メインスレッド (入力・描画) は塞がらない。
export function ocrImageToQuote(blob: Blob): Promise<string> {
  const id = nextId++
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'ocr', id, blob } satisfies ToOcrWorker)
  })
}
