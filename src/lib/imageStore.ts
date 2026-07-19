// 画像を DB に保存する共通の入口。
//
// 保存先は images テーブル (bytea)。ファイルシステムには置かないので、
// pg_dump だけでメモと画像が一緒にバックアップできる (docs/メモ記法.md)。
//
// 手で貼った画像 (/api/images の POST) と、サーバが取ってきた書影
// (docs/19-書影取得計画.md) の 2 か所から呼ばれる。名前の作り方を 2 通りに
// 散らすと、片方だけトラバーサル対策が抜けることが起きうる。

import { randomUUID } from 'node:crypto'
import { prisma } from './db'
import { generateEmbeddingInBackground } from './embedding/embedImageServer'
import { makeThumbnail } from './thumbnail'

// 画像を保存し、本文から参照する URL を返す。
//
// 名前は「サーバが生成した UUID + 対応拡張子」のみ。クライアント由来の
// 文字列をパスに使わない (uploads.ts の isValidImageName と対になっている)。
//
// 一覧用のサムネもここで作る。画像を作る経路はこの関数しかないので
// (docs/20-画像GC計画.md §1)、ここに置けばどの経路で入った画像にもサムネが付く。
// 作れなかった場合は thumb が null のまま保存する — 画像そのものは正しく
// 保存されており、一覧が原寸へフォールバックして遅くなるだけなので、
// アップロードを失敗させる理由にはならない (thumbnail.ts のコメント参照)。
export async function saveImage(
  // Prisma の Bytes は ArrayBuffer 実体の Uint8Array だけを受ける
  // (SharedArrayBuffer 由来のものは渡せない)
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  ext: string,
): Promise<string> {
  const name = `${randomUUID()}.${ext}`
  const thumb = await makeThumbnail(bytes, name)
  await prisma.image.create({ data: { name, mime, data: bytes, thumb } })
  // 画像検索用の埋め込みを「待たずに」作る (docs/25-画像検索計画.md §4)。
  // 初回はモデル読み込みで数秒かかるため応答を待たせない。生成できなければ
  // embedding は null のままで、scripts/backfillEmbeddings.ts が後から埋める。
  generateEmbeddingInBackground(name, bytes, mime)
  return `/api/images/${name}`
}

// 変換せずそのまま保存する添付 (音声・PDF) の入口 (docs/12-添付ファイル種類拡張メモ.md)。
//
// 画像と同じ images テーブルに置くが、変換もサムネも埋め込みも作らない:
// ブラウザが直接再生・表示でき (mp3/m4a/wav/pdf)、一覧に並べる絵でも画像検索の
// 対象でもないため、thumb / embedding は null のままにする。名前の作り方は
// saveImage と同じ「サーバ生成 UUID + 対応拡張子」で、トラバーサル対策を
// 1 か所に揃える。
export async function savePlainAttachment(
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  ext: string,
): Promise<string> {
  const name = `${randomUUID()}.${ext}`
  await prisma.image.create({ data: { name, mime, data: bytes } })
  return `/api/images/${name}`
}
