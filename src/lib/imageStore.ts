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

// 画像を保存し、本文から参照する URL を返す。
//
// 名前は「サーバが生成した UUID + 対応拡張子」のみ。クライアント由来の
// 文字列をパスに使わない (uploads.ts の isValidImageName と対になっている)。
export async function saveImage(
  // Prisma の Bytes は ArrayBuffer 実体の Uint8Array だけを受ける
  // (SharedArrayBuffer 由来のものは渡せない)
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  ext: string,
): Promise<string> {
  const name = `${randomUUID()}.${ext}`
  await prisma.image.create({ data: { name, mime, data: bytes } })
  return `/api/images/${name}`
}
