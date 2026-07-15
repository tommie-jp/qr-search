// 画像アップロードの制約。SVG はスクリプトを埋め込めるため対応しない
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

// 保存ファイル名は「サーバが生成した UUID + 対応拡張子」のみ。
// クライアント由来の文字列をパスに使わないことでトラバーサルを防ぐ
const IMAGE_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/

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

// 拡張子ごとの先頭バイト署名 (offset, bytes)。
// クライアント申告の MIME を信用せず、実際の中身と一致するか確認する
const MAGIC_BYTES: Record<string, Array<[number, number[]]>> = {
  png: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  jpg: [[0, [0xff, 0xd8, 0xff]]],
  gif: [[0, [0x47, 0x49, 0x46, 0x38]]], // "GIF8" (87a/89a 共通)
  webp: [
    [0, [0x52, 0x49, 0x46, 0x46]], // "RIFF"
    [8, [0x57, 0x45, 0x42, 0x50]], // "WEBP"
  ],
}

export function matchesMagicBytes(bytes: Uint8Array, ext: string): boolean {
  const signatures = MAGIC_BYTES[ext]
  if (!signatures) {
    return false
  }
  return signatures.every(([offset, expected]) =>
    expected.every((byte, i) => bytes[offset + i] === byte),
  )
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
