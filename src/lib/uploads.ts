import path from 'node:path'

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

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads')
}
