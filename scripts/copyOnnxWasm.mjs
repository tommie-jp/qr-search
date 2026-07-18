// OCR (ppu-paddle-ocr) の推論エンジン onnxruntime-web は、既定で .wasm を
// jsDelivr の CDN から取りに行く。zxing (copyZxingWasm.mjs) と同じく外部依存を
// 作りたくないので、node_modules から public/ へ複製して自前で配る。
// OCR サービス側で ort.env.wasm.wasmPaths = '/onnxruntime/' を指す。
//
// JS グルー (.mjs) と .wasm はバージョンがペアなので、node_modules から複製する
// 形ならパッケージ更新でも両者がずれない。
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(projectRoot, 'node_modules', 'onnxruntime-web', 'dist')
const destDir = path.join(projectRoot, 'public', 'onnxruntime')

// スレッド版 SIMD の wasm と、それを読むグルー。バリアントは素 (WASM 実行) の
// ほか .jsep / .jspi / .asyncify があり、**どれが選ばれるかは実行時のブラウザ
// 能力で決まる**。決め打ちで絞ると取りこぼした端末だけ
// 「no available backend found」で落ちるので、列挙せず全部運ぶ
// (画像検索で実際に踏んだ。copyEmbeddingWasm.mjs と同じ)。
const NEEDED = /^ort-wasm-simd-threaded[.\w]*\.(wasm|mjs)$/

const entries = await readdir(srcDir)
const targets = entries.filter((name) => NEEDED.test(name))

// 複製元が空なら気づけるように落とす。黙って 0 個配ると
// 「OCR だけ動かない」を後から追う羽目になる (zxing と同じ考え方)。
if (targets.length === 0) {
  throw new Error(`onnxruntime-web の wasm が見つかりません: ${srcDir}`)
}

await mkdir(destDir, { recursive: true })
for (const name of targets) {
  await copyFile(path.join(srcDir, name), path.join(destDir, name))
}

console.log(`onnxruntime wasm: ${targets.length} files -> public/onnxruntime/`)
