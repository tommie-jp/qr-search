// 「受け取ったバイト列を添付として保存する」判断を 1 箇所に集めた入口。
//
// 手で貼ったアップロード (/api/images の POST) と ENEX インポート
// (docs/28-エクスポート計画.md §4) の 2 経路から呼ぶ。**形式の判定と変換を
// 2 か所に書くと必ず片方だけ古くなる** — 実際 uploads.ts のコメントが
// 「名前の作り方を 2 通りに散らすと片方だけトラバーサル対策が抜ける」と
// 書いているのと同じ理由で、判定側もここへ寄せる。
//
// 形式はクライアント / ENEX の申告 MIME ではなく**中身の先頭バイト**で決める。
// ENEX の <resource><mime> は書き出し元の申告でしかなく、信用する理由がない。

import { saveImage, type SaveImageOptions, savePlainAttachment } from './imageStore'
import { moveMoovToFront } from './mp4Faststart'
import { normalizeImage } from './normalizeImage'
import { hasUtf16Bom, normalizeTextBytes } from './normalizeText'
import {
  audioSaveInfo,
  type ImageFormat,
  MAX_IMAGE_BYTES,
  PDF_EXT,
  PDF_MIME,
  sniffAudioFormat,
  sniffImageFormat,
  sniffPdf,
  textSaveInfo,
  tooLargeMessage,
} from './uploads'

export const UNSUPPORTED_ATTACHMENT_MESSAGE =
  '対応していない形式です (画像: png/jpg/gif/webp/avif/heic/tiff, 音声: mp3/m4a/wav/webm, PDF: pdf, テキスト: txt/csv/md)'

export interface StoreAttachmentOptions extends SaveImageOptions {
  // 1 件あたりの上限 (既定: MAX_IMAGE_BYTES = 10MB)。
  //
  // 既定値は **HTTP でアップロードする経路の都合**で決まっている — エッジ
  // (Caddyfile / deploy/nginx) のボディ上限 12MB に収まる大きさ。DB に
  // 置ける大きさの上限ではない。
  //
  // ファイルから直接読む一括取り込み (scripts/importEnex.ts) は HTTP を
  // 通らないので、この制限を課す理由がない。実際、iPhone の写真は 10MB を
  // 普通に超える (手元の書き出しでは 10 枚中 3 枚が 11〜12MB)。
  //
  // 判定は**変換前のバイト列**に対して行う点に注意。HEIC は保存時に WebP へ
  // 縮むが、その前にここで弾かれる
  maxBytes?: number

  // 元のファイル名 (アップロードなら File.name、ENEX なら file-name 属性)。
  //
  // **テキストだけがこれを要る。** 画像・音声・PDF は中身から形式が決まるが、
  // txt / csv / md は中身が同じなので拡張子でしか区別できない (uploads.ts の
  // textSaveInfo)。申告をそのまま保存名にはせず、既知の 3 つへ写すだけ。
  // 無ければ txt として保存する
  fileName?: string | null
}

export type AttachmentResult =
  | {
      ok: true
      // 本文から参照する URL (/api/images/<name>)
      url: string
      // 保存名。取り消し (インポートの巻き戻し) で行を消すために返す
      name: string
      // 画像なら本文に ![](url) で貼れる。音声・PDF はリンクにする
      isImage: boolean
    }
  | { ok: false; reason: string }

// 保存できたら url / name を、できなければ理由を返す。
//
// **例外は投げない**。呼び出し側は「1 件だめでも残りは続ける」(インポート) と
// 「400 で断る」(アップロード) のどちらかで、どちらも理由の文字列が要る。
export async function storeAttachment(
  // Prisma の Bytes は ArrayBuffer 実体の Uint8Array だけを受ける
  bytes: Uint8Array<ArrayBuffer>,
  options: StoreAttachmentOptions = {},
): Promise<AttachmentResult> {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES
  if (bytes.byteLength > maxBytes) {
    return { ok: false, reason: tooLargeMessage(maxBytes) }
  }

  // まず画像として判定し、外れたら音声 (mp3/m4a/wav/webm)、PDF の順に試す
  const imageFormat = sniffImageFormat(bytes)
  if (imageFormat) {
    return storeImage(bytes, imageFormat, options)
  }

  // UTF-16 の BOM を持つテキストは、音声判定より**先に**確定させる。
  // UTF-16LE の BOM `FF FE` は緩い MP3 判定に音声として横取りされてしまう
  // (`FF FE` は MPEG1 Layer II の同期語としても妥当)。BOM + テキスト名なら
  // それはテキストなので、ここで決める。名前がテキストでない UTF-16 BOM
  // (稀な mp2 等) は null が返り、下の音声判定に委ねられる (normalizeText.ts)
  if (hasUtf16Bom(bytes)) {
    const asText = await tryStoreText(bytes, options)
    if (asText) {
      return asText
    }
  }

  const audioFormat = sniffAudioFormat(bytes)
  if (audioFormat) {
    // 音声は変換もサムネも要らない。中身をそのまま保存する。
    // 唯一の例外が m4a の moov 並べ替えで、これは変換ではなく**箱の詰め替え**
    // (音声データは 1 バイトも変わらない)。iOS Safari の録音とボイスメモは
    // moov が末尾に付き、そのままだと <audio> が再生を始められない
    const { mime, ext } = audioSaveInfo(audioFormat)
    const stored = audioFormat === 'm4a' ? (moveMoovToFront(bytes) ?? bytes) : bytes
    return succeed(await savePlainAttachment(stored, mime, ext), false)
  }

  if (sniffPdf(bytes)) {
    // PDF もそのまま保存し、表示はブラウザ内蔵ビューアに任せる
    return succeed(await savePlainAttachment(bytes, PDF_MIME, PDF_EXT), false)
  }

  // テキストは**最後に試す**。署名で決まる形式をすべて外してから見る
  // (先に置くと、たまたまテキストとして読めてしまう署名つきファイルを
  // 横取りしてしまう)。UTF-16 BOM だけは上で先に拾っている
  const asText = await tryStoreText(bytes, options)
  if (asText) {
    return asText
  }

  return { ok: false, reason: UNSUPPORTED_ATTACHMENT_MESSAGE }
}

// テキストとして保存できるか試す。判定は 2 つとも通ったときだけ:
//   1. 名前が txt/csv/md であること (uploads.ts textSaveInfo)
//   2. 中身がテキストとして読めること (normalizeText.ts)
// 名前だけでは中身がバイナリのものを受けてしまい、中身だけでは HTML や SVG が
// 名前を偽ったまま通ってしまう。中身は UTF-8 へ正規化されて保存される。
//
// 戻り値の 3 通り:
//   - null      … 名前がテキストでない (= テキストではない。別形式に委ねる)
//   - ok: false … 名前は合うが中身を読めなかった (これ以上は試さない)
//   - ok: true  … 保存できた
async function tryStoreText(
  bytes: Uint8Array<ArrayBuffer>,
  options: StoreAttachmentOptions,
): Promise<AttachmentResult | null> {
  const textInfo = textSaveInfo(options.fileName)
  if (!textInfo) {
    return null
  }
  const text = normalizeTextBytes(bytes)
  if (!text) {
    return { ok: false, reason: UNSUPPORTED_ATTACHMENT_MESSAGE }
  }
  return succeed(
    await savePlainAttachment(text, textInfo.mime, textInfo.ext),
    false,
  )
}

// 画像の保存 (HEIC/TIFF は WebP へ変換してから)。
async function storeImage(
  bytes: Uint8Array<ArrayBuffer>,
  format: ImageFormat,
  options: SaveImageOptions,
): Promise<AttachmentResult> {
  // ブラウザが表示できない形式 (HEIC/TIFF) は保存前に WebP へ変換する。
  // 復号に失敗する = 壊れた画像なので断る (500 にはしない)
  let normalized
  try {
    normalized = await normalizeImage(bytes, format)
  } catch (error) {
    // 失敗は握り潰さずログに残す (thumbnail.ts と同じ流儀)。「特定の 1 枚が
    // 壊れている」のか「HEIC 復号器が丸ごと動いていない」(alpine/musl の
    // イメージ更新後など) のかを、件数と形式で切り分けられるようにする
    console.error(
      `画像の正規化に失敗しました (${format}, ${bytes.byteLength} bytes):`,
      error,
    )
    return {
      ok: false,
      reason: '画像を読み込めませんでした (壊れているか未対応の画像です)',
    }
  }

  const url = await saveImage(
    normalized.bytes,
    normalized.mime,
    normalized.ext,
    options,
  )
  return succeed(url, true)
}

function succeed(url: string, isImage: boolean): AttachmentResult {
  return { ok: true, url, name: url.slice(url.lastIndexOf('/') + 1), isImage }
}
