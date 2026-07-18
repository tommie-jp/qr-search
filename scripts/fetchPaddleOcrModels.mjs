// OCR (@paddleocr/paddleocr-js) の認識モデルを public/ へ落として自前で配る。
//
// SDK の既定はモデルを百度の CDN (paddle-model-ecology.bj.bcebos.com) から
// 直接取りに行くが、**そこはブラウザからは使えない**: レスポンスに
// Access-Control-Allow-Origin が付かず CORS で弾かれる (実機で確認)。
// 加えて配信元が中国本土のため初回ダウンロードが遅い。
// zxing / onnxruntime の wasm と同じく自前配布に寄せて、外部依存を断つ。
//
// 他の copy*.mjs は node_modules から複製するだけだが、モデルは npm に
// 入っていないのでここだけネットワークから取る。一度落としたら再取得しない
// (public/paddle-ocr は .gitignore 済み。CI やクリーンビルドでは取りに行く)。
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destDir = path.join(projectRoot, 'public', 'paddle-ocr')

const BASE_URL =
  'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0'

// PP-OCRv5 の mobile 版 (検出 + 認識)。日本語を含む統合モデルで、
// 公式パイプラインと同じ縦書き対応の組み合わせ (docs/24-画像OCR計画.md §2)。
// ファイル名は ocrService.ts の MODEL_ASSETS と対で効く。
const MODELS = ['PP-OCRv5_mobile_det', 'PP-OCRv5_mobile_rec']

// 落とし損ねた小さな HTML (エラーページ等) を掴んで「モデルが壊れている」に
// 化けるのを防ぐ。実物は det 4.8MB / rec 16.7MB なので 1MB を下限にする。
const MIN_SIZE_BYTES = 1024 * 1024

async function alreadyFetched(filePath) {
  try {
    const info = await stat(filePath)
    return info.size >= MIN_SIZE_BYTES
  } catch {
    return false
  }
}

await mkdir(destDir, { recursive: true })

let fetched = 0
for (const model of MODELS) {
  const fileName = `${model}.tar`
  const destPath = path.join(destDir, fileName)

  if (await alreadyFetched(destPath)) {
    continue
  }

  const url = `${BASE_URL}/${model}_onnx_infer.tar`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OCR モデルを取得できません: ${url} (${response.status})`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())

  // 黙って 0 バイトを配ると「OCR だけ動かない」を後から追う羽目になる
  // (copyZxingWasm.mjs と同じ考え方)。
  if (bytes.byteLength < MIN_SIZE_BYTES) {
    throw new Error(
      `OCR モデルが小さすぎます: ${url} (${bytes.byteLength} bytes)`,
    )
  }

  await writeFile(destPath, bytes)
  fetched += 1
}

console.log(
  fetched === 0
    ? 'paddle-ocr models: already present -> public/paddle-ocr/'
    : `paddle-ocr models: ${fetched} files -> public/paddle-ocr/`,
)
