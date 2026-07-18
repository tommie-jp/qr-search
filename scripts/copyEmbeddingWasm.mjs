// 画像検索の埋め込み (transformers.js) をブラウザで動かすとき、その下回りの
// onnxruntime-web は既定で .wasm を jsDelivr の CDN から取りに行く。
// OCR の copyOnnxWasm.mjs と同じく外部依存を作りたくないので、transformers.js が
// 抱える onnxruntime-web の dist から public/ へ複製して自前で配る。
// embedder.ts が env.backends.onnx.wasm.wasmPaths = '/embedding-onnx/' を指す。
//
// 注意: OCR (copyOnnxWasm.mjs) はトップレベルの onnxruntime-web を配るが、
// transformers.js は自分の node_modules に別バージョンの onnxruntime-web を
// 抱える。バージョンがずれると wasm とグルーが噛み合わないので、**必ず
// transformers.js が抱える方**から複製する (配布先ディレクトリも分ける)。
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(
  projectRoot,
  'node_modules',
  '@huggingface',
  'transformers',
  'node_modules',
  'onnxruntime-web',
  'dist',
)
const destDir = path.join(projectRoot, 'public', 'embedding-onnx')

// WASM 実行 (simd+threads) と WebGPU (jsep) のフォールバックで使う wasm と、
// WASM 実行と WebGPU で使う wasm と、それを読むグルー (.mjs)。
// バリアントは素 (WASM 実行) のほか .jsep / .jspi / .asyncify があり、
// **どれが選ばれるかは実行時のブラウザ能力で決まる** (WebGPU が有効な Chrome は
// .asyncify を取りに行く)。決め打ちで絞ると取りこぼした端末だけ
// 「no available backend found」で落ちるので、バリアントは列挙せず全部運ぶ。
// 実際に fetch されるのは 1 つだけなので、置いておく費用はディスクだけ。
const NEEDED = /^ort-wasm-simd-threaded[.\w]*\.(wasm|mjs)$/

const entries = await readdir(srcDir)
const targets = entries.filter((name) => NEEDED.test(name))

// 複製元が空なら気づけるように落とす。黙って 0 個配ると
// 「画像検索だけ動かない」を後から追う羽目になる (copyOnnxWasm.mjs と同じ)。
if (targets.length === 0) {
  throw new Error(`transformers.js の onnxruntime-web wasm が見つかりません: ${srcDir}`)
}

await mkdir(destDir, { recursive: true })
for (const name of targets) {
  await copyFile(path.join(srcDir, name), path.join(destDir, name))
}

console.log(`embedding onnx wasm: ${targets.length} files -> public/embedding-onnx/`)
