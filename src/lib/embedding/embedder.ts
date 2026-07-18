// 画像 → 埋め込みベクトルの実体 (docs/25-画像検索計画.md §2,3)。
//
// transformers.js の image-feature-extraction をブラウザ・Node のどちらでも
// 同じコードで動かす。**同じモデル・同じ量子化を両側で使う**ことで、保存時
// (Node) に作ったベクトルとカメラ (ブラウザ) のベクトルが同じ空間に乗る。
//
// 重い依存 (transformers.js + モデル) はモジュール読み込みでは走らせず、
// 最初に embed() を呼んだときだけ動的 import で取り込む。以後は singleton。
//
// 注意: ブラウザ側は Web Worker から呼ぶ想定 (UI スレッドを塞がないため)。
// canvas / OffscreenCanvas / Blob をそのまま渡せる (RawImage.read が吸収する)。

import { EMBEDDING_DTYPE, EMBEDDING_MODEL_ID } from './model'
import { extractEmbedding, type TensorLike } from './extractEmbedding'

// RawImage.read が受け付ける入力。ブラウザは canvas/Blob、Node は Blob を渡す。
export type EmbedInput =
  | Blob
  | HTMLCanvasElement
  | OffscreenCanvas
  | string
  | URL

// transformers.js の型は動的 import 側に閉じ込める (このモジュールを import
// しただけでライブラリ本体をバンドルに巻き込まないため)。
type Transformers = typeof import('@huggingface/transformers')
// pipeline() の返りは全タスクの共用体で「呼び出し可能」と型付かない。
// image-feature-extraction は画像を渡すとテンソルを返す関数として扱う。
type Extractor = (image: unknown) => Promise<TensorLike>

let libPromise: Promise<Transformers> | null = null
let extractorPromise: Promise<Extractor> | null = null
let ready = false

// Node (サーバ・バックフィル) かどうか。Node 21+ はブラウザ互換の global
// navigator を持つため navigator の有無では判別できない。process.versions.node で
// 見る (Next.js のブラウザバンドルは process.env は生やすが versions は生やさない)。
function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' && process.versions?.node != null
  )
}

// ブラウザ (メインスレッド/Worker) では WebGPU が**実際に使えれば**使う
// (iOS 26+/Safari 26)、駄目なら WASM。Node では undefined を返し、
// transformers.js に onnxruntime-node (native cpu) を選ばせる
// (Node は 'wasm' を受け付けない)。
//
// navigator.gpu の有無だけで決めてはいけない。WSL2 やソフトウェア描画の環境は
// API を生やしておきながらアダプタを返さず、'webgpu' を指定すると
// 「Failed to get GPU adapter」で読み込みごと落ちる。実際に requestAdapter して
// 確かめる (WASM で動くのが基準性能、WebGPU は加速ボーナス、が設計方針)。
async function pickDevice(): Promise<'webgpu' | 'wasm' | undefined> {
  if (isNodeRuntime()) {
    return undefined
  }
  // TS の lib.dom はまだ navigator.gpu を持たないので、使う分だけ型を当てる
  // (@webgpu/types を足すほどの用ではない)
  type GpuLike = { requestAdapter: () => Promise<unknown> }
  const gpu =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { gpu?: GpuLike }).gpu
      : undefined
  if (!gpu) {
    return 'wasm'
  }
  try {
    return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm'
  } catch {
    // アダプタ取得自体が投げる環境もある。WASM に落ちれば動く
    return 'wasm'
  }
}

async function loadLib(): Promise<Transformers> {
  const lib = await import('@huggingface/transformers')
  // ブラウザの WASM バックエンドは既定で ort の .wasm を CDN から取りに行く。
  // 自前配布した public/embedding-onnx/ を指して外部依存を断つ
  // (scripts/copyEmbeddingWasm.mjs)。Node では無関係。
  // ブラウザ (メインスレッド/Worker 両方) でだけ自前配布を指す。Worker には
  // window が無いので window の有無ではなく「Node でない」で判定する。
  const wasm = lib.env.backends?.onnx?.wasm
  if (!isNodeRuntime() && wasm) {
    wasm.wasmPaths = '/embedding-onnx/'
  }
  return lib
}

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      if (!libPromise) {
        libPromise = loadLib()
      }
      const lib = await libPromise
      const build = (device: 'webgpu' | 'wasm' | undefined) =>
        lib.pipeline('image-feature-extraction', EMBEDDING_MODEL_ID, {
          dtype: EMBEDDING_DTYPE,
          device,
        })

      const device = await pickDevice()
      let extractor
      try {
        extractor = await build(device)
      } catch (err) {
        // アダプタが取れても WebGPU の初期化はまだ落ちうる (ドライバ差)。
        // 加速に失敗しただけで機能ごと死なせない。WASM で組み直す
        if (device !== 'webgpu') {
          throw err
        }
        console.warn('WebGPU で初期化できなかったため WASM に切り替えます', err)
        extractor = await build('wasm')
      }
      ready = true
      return extractor as unknown as Extractor
    })()
  }
  return extractorPromise
}

// 初回のモデル読み込みが済んでいるか。UI が「準備中(初回)」を出すのに使う。
export function isEmbedderReady(): boolean {
  return ready
}

// 初回ロードを前もって温める (画像検索モーダルを開いた時点で呼ぶ)。
//
// 失敗を握りつぶすと、モデルを用意できなかった理由がコンソールの unhandled
// rejection にしか出ず、UI には当てずっぽうの案内しか出せない (自前配布した
// ort の wasm が 1 バリアント欠けていたのを、これで長く見落とした)。
// 呼び手が catch して理由を表示できるよう Promise を返す。
export async function preloadEmbedder(): Promise<void> {
  await getExtractor()
}

// 画像 1 枚 → 正規化済み埋め込みベクトル。
// pool=false (既定) で last_hidden_state を受け、CLS トークンを取る
// (extractEmbedding)。CLIP 系に替えたら image_embeds をそのまま使う。
export async function embed(input: EmbedInput): Promise<Float32Array> {
  // getExtractor が内部で loadLib() を起こすので、待てば libPromise は確定する
  const extractor = await getExtractor()
  const lib = await libPromise!
  const image = await lib.RawImage.read(input)
  const tensor = await extractor(image)
  return extractEmbedding(tensor as unknown as TensorLike)
}
