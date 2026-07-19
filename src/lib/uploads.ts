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

// ISO-BMFF の ftyp ボックスから brand 一覧 (major + compatible) を読む。
// ISO-BMFF でない・短すぎる入力は null。画像 (HEIC/AVIF) と音声 (m4a) の
// どちらもこの一覧を見て種別を決めるので、読み取り自体はここに集約する。
function readIsoBmffBrands(bytes: Uint8Array): string[] | null {
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
  return brands
}

function sniffIsoBmff(bytes: Uint8Array): ImageFormat | null {
  const brands = readIsoBmffBrands(bytes)
  if (!brands) {
    return null
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

// --- 音声 (docs/12-添付ファイル種類拡張メモ.md) ---
//
// 音声は画像と違い、変換もサムネも埋め込みもしない。ブラウザが直接再生できる
// 形式 (mp3/m4a/wav) だけを受け付け、images テーブルへそのまま bytes で保存し、
// そのまま配信する。images テーブルを流用するのは、pg_dump 一発でメモと一緒に
// バックアップできる利点 (imageStore.ts) を音声にも効かせるため。

export type AudioFormat = 'mp3' | 'm4a' | 'wav'

// 保存できる音声形式 (final mime) → 拡張子。画像の MIME_TO_EXT と同じ役割で、
// 配信時に「DB の mime を信じてよいか」の判定にも使う (未知 mime を配らない)。
const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
}

const AUDIO_FORMAT_TO_MIME: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

// 保存名は画像と同じ「UUID + 対応拡張子」だけ。拡張子は形式名がそのまま入る。
const AUDIO_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|m4a|wav)$/

// sniff で決めた形式を、保存に使う mime / ext へ写す (mp3/m4a/wav は形式名=拡張子)。
export function audioSaveInfo(format: AudioFormat): { mime: string; ext: string } {
  return { mime: AUDIO_FORMAT_TO_MIME[format], ext: format }
}

export function isValidAudioName(name: string): boolean {
  return AUDIO_NAME_PATTERN.test(name)
}

// 画像・音声・PDF のいずれの保存名も許すか。配信ゲート (route.ts) と proxy の
// 素通し判定 (publicPaths.ts) が使う。**memoImages などの「画像だけ」を
// 拾う経路は isValidImageName のままにする** — 音声や PDF を一覧サムネや画像
// 検索の対象に混ぜないため (この 2 つを分けているのが肝)。
export function isValidAttachmentName(name: string): boolean {
  return isValidImageName(name) || isValidAudioName(name) || isValidPdfName(name)
}

// 配信時に Content-Type としてそのまま返してよい mime か。画像・音声・PDF とも
// 保存時に中身を検証済みだが、DB の値を鵜呑みにせず既知の mime のときだけ採用する。
export function isAllowedContentMime(mime: string): boolean {
  return mime in MIME_TO_EXT || mime in AUDIO_MIME_TO_EXT || mime === PDF_MIME
}

// WAV は RIFF コンテナ: "RIFF"(0) + "WAVE"(8)
function isWav(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    [0x57, 0x41, 0x56, 0x45].every((byte, i) => bytes[8 + i] === byte)
  )
}

// MP3: ID3v2 タグ ("ID3") で始まるか、生フレームの同期語で始まる。
// 同期語は 11bit すべて 1 = 先頭 0xFF かつ次バイトの上位 3bit が立っている。
// JPEG (FF D8 …) は次バイトの上位 3bit が 110 なので当たらない (画像と衝突しない)。
function isMp3(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0x49, 0x44, 0x33])) {
    return true
  }
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

// m4a を名乗る ISO-BMFF ブランド。動画 (mp42/isom 単独) を音声として受けない
// よう、音声専用の M4A / M4B だけを見る。iPhone のボイスメモ (.m4a) は major
// brand が "M4A " なのでこれで拾える。他ツール由来の mp42 単独 m4a は弾かれるが、
// 動画混入を防ぐことを優先する (docs/12)。
const M4A_BRANDS = new Set(['M4A ', 'M4B '])

function sniffIsoBmffAudio(bytes: Uint8Array): AudioFormat | null {
  const brands = readIsoBmffBrands(bytes)
  if (!brands) {
    return null
  }
  return brands.some((b) => M4A_BRANDS.has(b)) ? 'm4a' : null
}

// 先頭バイトから音声形式を判定する。判定できなければ null (=非対応)。
// route.ts は画像判定 (sniffImageFormat) が外れたときにこれを試す。
export function sniffAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (isMp3(bytes)) {
    return 'mp3'
  }
  if (isWav(bytes)) {
    return 'wav'
  }
  return sniffIsoBmffAudio(bytes)
}

// --- PDF (docs/12-添付ファイル種類拡張メモ.md) ---
//
// PDF も音声と同じく変換もサムネも埋め込みもせず、images テーブルへそのまま
// 保存する。表示はブラウザ内蔵ビューアに任せ (本文にはリンクだけ出す)、
// 配信は音声と同じ経路 (Content-Type + Range) をそのまま使う。

export const PDF_MIME = 'application/pdf'
export const PDF_EXT = 'pdf'

// 保存名は画像・音声と同じ「UUID + .pdf」だけ (トラバーサル対策)。
const PDF_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/

export function isValidPdfName(name: string): boolean {
  return PDF_NAME_PATTERN.test(name)
}

// PDF は先頭が "%PDF-" (25 50 44 46 2D)。仕様上ヘッダは先頭 1KB 以内に
// あればよいが、ポリグロット (先頭が別形式に見える PDF) を避けるため
// offset 0 固定で見る (画像の署名判定と同じ厳しさ)。
export function sniffPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
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
