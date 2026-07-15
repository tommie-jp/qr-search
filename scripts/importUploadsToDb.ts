// uploads volume 上の既存画像を images テーブルへ取り込む (画像の DB 移行用)。
// 冪等: 既に DB にある name は skipDuplicates で飛ばすため、何度実行してもよい。
//
// 使い方:
//   UPLOAD_DIR=/path/to/uploads npx tsx scripts/importUploadsToDb.ts
//
// リモート (vps2) の画像を取り込む場合は、画像を手元に降ろしてから
// SSH トンネル経由でリモート DB を指す (doDeploy.sh の migrate と同じ方式):
//   ssh vps2 "cd 41-QR-search/qr-search && docker compose exec -T app tar cf - -C /app/data/uploads ." \
//     | tar xf - -C /tmp/vps2-uploads
//   ssh -f -N -L 127.0.0.1:15432:127.0.0.1:5432 vps2
//   DATABASE_URL="postgresql://qr:<pw>@127.0.0.1:15432/qr" UPLOAD_DIR=/tmp/vps2-uploads \
//     npx tsx scripts/importUploadsToDb.ts
import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/db'
import { isValidImageName, matchesMagicBytes, mimeForName } from '@/lib/uploads'

function getUploadDir(): string {
  const dir = process.env.UPLOAD_DIR
  if (!dir) {
    throw new Error('UPLOAD_DIR is not set (取り込み元の uploads ディレクトリを指定すること)')
  }
  return dir
}

interface ImageRow {
  name: string
  mime: string
  // Prisma の Bytes は Uint8Array<ArrayBuffer>。readFile が返す Buffer は
  // Uint8Array<ArrayBufferLike> で代入できないため、明示して from() で変換する
  data: Uint8Array<ArrayBuffer>
}

// 取り込めないファイルはスキップせず即エラーにする。
// 「黙って一部だけ入った」状態は volume 削除後に気付けないため許容しない。
async function readImage(dir: string, name: string): Promise<ImageRow> {
  if (!isValidImageName(name)) {
    throw new Error(`想定外のファイル名: ${name}`)
  }
  const mime = mimeForName(name)
  if (!mime) {
    throw new Error(`MIME を判定できない: ${name}`)
  }

  const data = Uint8Array.from(await readFile(path.join(dir, name)))
  const ext = name.split('.').pop() as string
  if (!matchesMagicBytes(data, ext)) {
    throw new Error(`中身が ${ext} ではない: ${name}`)
  }

  return { name, mime, data }
}

async function main(): Promise<void> {
  const dir = getUploadDir()
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
  console.log(`取り込み元: ${dir} (${names.length} ファイル)`)

  const rows: ImageRow[] = []
  for (const name of names) {
    rows.push(await readImage(dir, name))
  }

  const { count } = await prisma.image.createMany({ data: rows, skipDuplicates: true })
  console.log(`新規取り込み: ${count} 件 / 既に DB にあった: ${rows.length - count} 件`)

  // volume を消す前に「全ファイルが DB にある」ことを確認する。
  // createMany の count は新規分のみのため、件数照合は DB 実体に対して行う。
  const stored = await prisma.image.count({ where: { name: { in: names } } })
  if (stored !== names.length) {
    throw new Error(`取り込み漏れ: volume ${names.length} 件 / DB ${stored} 件`)
  }
  console.log(`照合 OK: volume の ${names.length} 件すべてが DB にある`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
