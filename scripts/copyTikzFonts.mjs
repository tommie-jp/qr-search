// node-tikzjax が出力する SVG は輪郭パスではなく <text font-family="cmmi10"> を使うため、
// Computer Modern の webfont を配らないと文字が化ける。
//
// 既定の配信元は jsDelivr の CDN だが、外部依存を作りたくないので自前で配る
// (renderCircuit.cjs が fontCssUrl: '/tikzjax/fonts.css' を渡している)。
//
// フォントは npm パッケージに同梱されているため、リポジトリに 3.7MB の TTF を
// 抱え込まず、ビルドのたびにここから public/ へ複製する。
// パッケージを更新すればフォントも自動で追随する。
import { cp, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(projectRoot, 'node_modules', 'node-tikzjax', 'css')
const dest = path.join(projectRoot, 'public', 'tikzjax')

// fonts.css は 'bakoma/ttf/cmr10.ttf' のような相対 URL を持つため、
// fonts.css と bakoma/ を同じ階層に置く必要がある
await mkdir(dest, { recursive: true })
await cp(path.join(src, 'fonts.css'), path.join(dest, 'fonts.css'))
await cp(path.join(src, 'bakoma'), path.join(dest, 'bakoma'), { recursive: true })

const fonts = await readdir(path.join(dest, 'bakoma', 'ttf'))
console.log(`tikzjax fonts: ${fonts.length} files -> public/tikzjax/`)
