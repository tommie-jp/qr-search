// barcode-detector (スキャナの読み取りエンジン) は既定で .wasm を jsDelivr の
// CDN から取りに行くが、外部依存を作りたくないので自前で配る
// (ScannerModal.tsx が locateFile: () => '/zxing/zxing_reader.wasm' を渡している)。
//
// リポジトリに 1MB の wasm を抱え込まず、ビルドのたびにここから public/ へ複製する。
// JS グルーと wasm はバージョンがペアなので、node_modules から複製する形なら
// パッケージを更新しても両者がずれない (CDN 固定 URL や同梱だとずれる)。
//
// tikzjax フォント (copyTikzFonts.mjs) と同じ考え方。
import { copyFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// reader ビルドを使う (読み取り専用。書き込み側は QR 生成の qrcode パッケージが持つ)
const src = path.join(projectRoot, 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm')
const dest = path.join(projectRoot, 'public', 'zxing')
const destFile = path.join(dest, 'zxing_reader.wasm')

// 複製元が消えていたら気づけるように落とす。黙って古い wasm を配ると
// バージョンずれで「スキャンだけ動かない」を追う羽目になる
const { size } = await stat(src)

await mkdir(dest, { recursive: true })
await copyFile(src, destFile)

console.log(`zxing wasm: ${(size / 1024 / 1024).toFixed(2)} MB -> public/zxing/zxing_reader.wasm`)
