// 保存できる画像形式 (final mime) → 拡張子。
// これは「そのまま DB に保存できる = ブラウザが表示できる」形式の表。
// HEIC/HEIF・TIFF は保存時に WebP へ変換するのでここには無い
// (変換後の image/webp として入る。docs/26-画像形式対応計画.md §2)。
// SVG はスクリプトを埋め込めるため対応しない。
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

// 保存ファイル名は「サーバが生成した UUID + 対応拡張子」のみ。
// クライアント由来の文字列をパスに使わないことでトラバーサルを防ぐ。
// heic/tiff は変換後に webp になるため、ここには現れない
const IMAGE_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif)$/

export function extForMime(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null
}

export function mimeForName(name: string): string | null {
  const ext = name.split('.').pop()
  const entry = Object.entries(MIME_TO_EXT).find(([, e]) => e === ext)
  return entry ? entry[0] : null
}

export function isValidImageName(name: string): boolean {
  return IMAGE_NAME_PATTERN.test(name)
}

// アップロードで受け付ける画像形式。normalizeImage はこの値で
// 「無変換保存」か「WebP へ変換」かを振り分ける (docs/26 §2)。
export type ImageFormat = 'png' | 'jpg' | 'gif' | 'webp' | 'avif' | 'heic' | 'tiff'

// offset 0 固定の先頭バイト署名。png/jpg/gif/webp/tiff はこれで判定できる。
// クライアント申告の MIME を信用せず、実際の中身から形式を決める
// (MIME を空で送る OS があり、詐称対策にもなる)
const HEAD_SIGNATURES: Array<[ImageFormat, number[]]> = [
  ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['jpg', [0xff, 0xd8, 0xff]],
  ['gif', [0x47, 0x49, 0x46, 0x38]], // "GIF8" (87a/89a 共通)
  ['tiff', [0x49, 0x49, 0x2a, 0x00]], // "II*\0" little-endian
  ['tiff', [0x4d, 0x4d, 0x00, 0x2a]], // "MM\0*" big-endian
]

function startsWith(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((byte, i) => bytes[i] === byte)
}

// WebP は RIFF コンテナ: "RIFF" (0) + "WEBP" (8)
function isWebp(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    [0x57, 0x45, 0x42, 0x50].every((byte, i) => bytes[8 + i] === byte)
  )
}

// HEIC/AVIF は ISO-BMFF。offset 4 の "ftyp" ボックスに major brand と
// compatible brands が並ぶ。offset 0 固定署名では判定できないため、
// ブランド一覧を読んで種別を決める (docs/26 §4)
const AVIF_BRANDS = new Set(['avif', 'avis'])
// mif1/msf1 は HEIF 汎用ブランドで AVIF ファイルにも現れうるが、
// AVIF を先に判定するのでここに残してよい (HEVC 系の総称として扱う)
const HEIC_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis',
  'hevc', 'hevx', 'hevm', 'hevs',
  'mif1', 'msf1',
])

function sniffIsoBmff(bytes: Uint8Array): ImageFormat | null {
  // ボックス長(4) + "ftyp"(4) + major brand(4) の最低 12 バイトが無ければ
  // ISO-BMFF ではない。下の getUint32 が短い入力で throw しないための明示ガード
  // でもある (この関数は throw しない契約。呼び出し側は try/catch しない)
  if (bytes.byteLength < 12) {
    return null
  }
  // "ftyp" が offset 4 に無ければ ISO-BMFF ではない
  if (!startsWith(bytes.subarray(4), [0x66, 0x74, 0x79, 0x70])) {
    return null
  }
  // ボックス長で compatible brands の走査範囲を縛る (壊れた長さは全長で代用)
  const declared = new DataView(
    bytes.buffer, bytes.byteOffset, bytes.byteLength,
  ).getUint32(0)
  const end = declared >= 16 && declared <= bytes.byteLength ? declared : bytes.byteLength
  const decoder = new TextDecoder('latin1')
  // major brand(8..12) と compatible brands(16..) を集める (12..16 は minor version)
  const brands: string[] = [decoder.decode(bytes.subarray(8, 12))]
  for (let off = 16; off + 4 <= end; off += 4) {
    brands.push(decoder.decode(bytes.subarray(off, off + 4)))
  }
  // AVIF を先に見る: mif1 を兼ねる AVIF を HEIC と誤判定しないため
  if (brands.some((b) => AVIF_BRANDS.has(b))) {
    return 'avif'
  }
  if (brands.some((b) => HEIC_BRANDS.has(b))) {
    return 'heic'
  }
  return null // ftyp だが画像でない (mp4 動画など)
}

// 先頭バイトから画像形式を判定する。判定できなければ null (=非対応)。
// アップロード経路・書影取得の両方がこれを唯一の入口にする
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  for (const [format, signature] of HEAD_SIGNATURES) {
    if (startsWith(bytes, signature)) {
      return format
    }
  }
  if (isWebp(bytes)) {
    return 'webp'
  }
  return sniffIsoBmff(bytes)
}

// multipart のヘッダ等のオーバーヘッド分を上限に足す
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 1024 * 1024

export interface UploadRejection {
  status: number
  error: string
}

// 本文を読む前に弾けるものだけを見る。問題なければ null。
export function checkUploadRequest(request: Request): UploadRejection | null {
  // CSRF 対策: ブラウザがクロスオリジン POST に付ける Origin がホストと
  // 食い違う場合は本文を読む前に拒否する (同一オリジンの fetch は許可)
  const origin = request.headers.get('origin')
  if (origin && !isSameOrigin(origin, request)) {
    return { status: 403, error: 'クロスオリジンのアップロードは許可されていません' }
  }

  // メモリ枯渇対策: formData() は本文全体をバッファするため、
  // Content-Length の時点で明らかに大きすぎるものは先に弾く
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return { status: 413, error: tooLargeMessage() }
  }

  return null
}

function isSameOrigin(origin: string, request: Request): boolean {
  const host = request.headers.get('host') ?? new URL(request.url).host
  try {
    return new URL(origin).host === host
  } catch {
    // パースできない Origin は正規のブラウザが送るものではない。同一とはみなさない
    return false
  }
}

export function tooLargeMessage(): string {
  return `ファイルが大きすぎます (最大 ${MAX_IMAGE_BYTES / 1024 / 1024}MB)`
}
