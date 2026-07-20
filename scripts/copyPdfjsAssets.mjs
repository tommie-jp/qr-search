// PDF ビューア (pdfjs-dist) が実行時に取りに行くアセットを public/ へ複製する。
//
// **なぜ自前で配るか**: 既定では CDN や import.meta.url 相対で解決しようとする。
// 外部依存を作らない方針 (copyZxingWasm.mjs と同じ) に加え、Turbopack が
// worker の import.meta.url 相対解決を追えずビルドを落とすため、
// worker は固定パス (/pdfjs/pdf.worker.min.mjs) で渡す。
//
// **なぜ cmaps が要るか**: 日本語 PDF は Adobe の定義済み CMap
// (Adobe-Japan1 など) をフォント参照に使う。これが無いと本文が空白や
// 豆腐になる。169 ファイルあるが、pdf.js が必要なものだけ実行時に取るので
// 転送量は 1 ファイル分しか増えない (ディスクを食うだけ)。
//
// **なぜ standard_fonts が要るか**: フォントを埋め込んでいない PDF
// (Helvetica などの標準 14 フォント指定) の描画に使う。
//
// **wasm**: JBIG2 / JPEG2000 の画像デコードと色管理 (qcms) に使う。
// ただし quickjs-eval.* (PDF 内 JavaScript の実行エンジン) は複製しない —
// enableScripting を有効にしないので使わず、置かないことで
// 「うっかり有効化しても動かない」を構造で担保する。
//
// リポジトリにこれらを抱え込まず、ビルドのたびに node_modules から複製する。
// パッケージを更新しても本体とアセットのバージョンがずれない。
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgRoot = path.join(projectRoot, 'node_modules', 'pdfjs-dist')
const destRoot = path.join(projectRoot, 'public', 'pdfjs')

// PDF 内 JavaScript の実行エンジン。enableScripting を使わないので複製しない
const EXCLUDED = /^quickjs-eval\./

async function copyDir(fromDir, toDir) {
  await mkdir(toDir, { recursive: true })
  const entries = await readdir(fromDir, { withFileTypes: true })
  let bytes = 0
  for (const entry of entries) {
    if (!entry.isFile() || EXCLUDED.test(entry.name)) {
      continue
    }
    const from = path.join(fromDir, entry.name)
    await copyFile(from, path.join(toDir, entry.name))
    bytes += (await stat(from)).size
  }
  return bytes
}

// 複製元が消えていたら気づけるように落とす。黙って古い worker を配ると
// バージョンずれで「PDF だけ開かない」を追う羽目になる (copyZxingWasm と同じ流儀)
const workerSrc = path.join(pkgRoot, 'build', 'pdf.worker.min.mjs')
const workerBytes = (await stat(workerSrc)).size
await mkdir(destRoot, { recursive: true })
await copyFile(workerSrc, path.join(destRoot, 'pdf.worker.min.mjs'))

let total = workerBytes
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  total += await copyDir(path.join(pkgRoot, dir), path.join(destRoot, dir))
}

console.log(`pdfjs assets: ${(total / 1024 / 1024).toFixed(2)} MB -> public/pdfjs/`)
