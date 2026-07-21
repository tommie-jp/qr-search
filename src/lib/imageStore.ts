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
import {
  generateEmbedding,
  generateEmbeddingInBackground,
} from './embedding/embedImageServer'
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
export interface SaveImageOptions {
  // 埋め込みの生成を後回しにする (行は embedding=null で作る)。
  //
  // 一括取り込み (ENEX インポート) 用。埋め込みの生成はモデルの読み込みだけで
  // **RSS が 475MB 増える** (実測)。1 枚ずつのアップロードなら 1 回で済むが、
  // 取り込みは画像の数だけ「待たない」生成を撃つので、本番 VPS (RAM 2GB /
  // swap 常用。docs/09-vps振り分け移行手順.md) では取り込み中に落ちる。
  //
  // 後回しにしても失うものは無い。embedding は data から作れる派生キャッシュで、
  // null の行は scripts/backfillEmbeddings.ts が後から埋める設計になっている
  // (この関数がもともと生成失敗を握り潰しているのと同じ理由)。
  deferEmbedding?: boolean

  // 埋め込みの生成を**待つ**。既定は待たない (応答を止めないため)。
  //
  // 一括取り込み (scripts/importEnex.ts) 用。CLI は処理を終えると
  // prisma.$disconnect() してプロセスを畳むので、待たないと最後の数枚が
  // 切断と競合して黙って欠ける。deferEmbedding が true のときは無関係
  awaitEmbedding?: boolean
}

export async function saveImage(
  // Prisma の Bytes は ArrayBuffer 実体の Uint8Array だけを受ける
  // (SharedArrayBuffer 由来のものは渡せない)
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  ext: string,
  options: SaveImageOptions = {},
): Promise<string> {
  const name = `${randomUUID()}.${ext}`
  const thumb = await makeThumbnail(bytes, name)
  await prisma.image.create({ data: { name, mime, data: bytes, thumb } })
  // 画像検索用の埋め込みを「待たずに」作る (docs/25-画像検索計画.md §4)。
  // 初回はモデル読み込みで数秒かかるため応答を待たせない。生成できなければ
  // embedding は null のままで、scripts/backfillEmbeddings.ts が後から埋める。
  if (!options.deferEmbedding) {
    if (options.awaitEmbedding) {
      await generateEmbedding(name, bytes, mime)
    } else {
      generateEmbeddingInBackground(name, bytes, mime)
    }
  }
  return `/api/images/${name}`
}

// 変換せずそのまま保存する添付 (音声・動画・PDF) の入口
// (docs/12-添付ファイル種類拡張メモ.md, docs/14-動画挿入計画.md)。
//
// 画像と同じ images テーブルに置くが、サーバ側の変換も埋め込みも作らない:
// ブラウザが直接再生・表示でき (mp3/m4a/wav/mp4/webm/pdf)、画像検索の対象でも
// ないため embedding は null のままにする。名前の作り方は saveImage と同じ
// 「サーバ生成 UUID + 対応拡張子」で、トラバーサル対策を 1 か所に揃える。
//
// thumb は動画のときだけ渡る — クライアントが先頭フレームから作った WebP
// (docs/14 §Phase3)。サーバに ffmpeg を持ち込まずに poster を出すための唯一の
// 経路。音声・PDF は渡さないので従来どおり null。
export async function savePlainAttachment(
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  ext: string,
  thumb?: Uint8Array<ArrayBuffer> | null,
): Promise<string> {
  const name = `${randomUUID()}.${ext}`
  await prisma.image.create({ data: { name, mime, data: bytes, thumb: thumb ?? null } })
  return `/api/images/${name}`
}

// images テーブルの実データ総バイト数 (デモの総量クォータ。docs/39 §2-1)。
// 全種別 (画像・音声・PDF・テキスト) が同じテーブルの bytea なので 1 本で足りる。
// Prisma の aggregate は bytea 長を取れないため生 SQL で octet_length を合計する。
// 空テーブルでも 0 を返す (COALESCE)。SUM は numeric(bigint) で返るので Number に畳む。
export async function totalAttachmentBytes(): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM(octet_length(data)), 0)::bigint AS total FROM images
  `
  return Number(rows[0]?.total ?? 0)
}
