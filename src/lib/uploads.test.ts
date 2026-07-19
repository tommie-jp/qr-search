import { expect, test } from 'vitest'
import {
  audioSaveInfo,
  checkUploadRequest,
  extForMime,
  isAllowedContentMime,
  isValidAttachmentName,
  isValidAudioName,
  isValidImageName,
  isValidPdfName,
  MAX_IMAGE_BYTES,
  PDF_MIME,
  sniffAudioFormat,
  sniffImageFormat,
  sniffPdf,
} from './uploads'

test('対応する画像 MIME は拡張子を返す', () => {
  expect(extForMime('image/png')).toBe('png')
  expect(extForMime('image/jpeg')).toBe('jpg')
  expect(extForMime('image/gif')).toBe('gif')
  expect(extForMime('image/webp')).toBe('webp')
  expect(extForMime('image/avif')).toBe('avif')
})

test('画像以外・危険な MIME は null を返す', () => {
  expect(extForMime('image/svg+xml')).toBeNull() // SVG はスクリプト埋め込み可能なため拒否
  expect(extForMime('text/html')).toBeNull()
  expect(extForMime('application/pdf')).toBeNull()
  expect(extForMime('')).toBeNull()
})

test('UUID + 対応拡張子のファイル名だけを許可する', () => {
  expect(
    isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678.png'),
  ).toBe(true)
  expect(isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678.jpg')).toBe(true)
  // AVIF は無変換で保存するので保存名にも現れる
  expect(isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678.avif')).toBe(true)
})

test('パストラバーサル・不正なファイル名を拒否する', () => {
  expect(isValidImageName('../../etc/passwd')).toBe(false)
  expect(isValidImageName('..%2Fsecret.png')).toBe(false)
  expect(isValidImageName('a.png')).toBe(false) // UUID 形式でない
  expect(isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678.svg')).toBe(false)
  // HEIC/TIFF は保存時に webp へ変換するため、この拡張子で保存名は作られない
  expect(isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678.heic')).toBe(false)
  expect(isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678.tiff')).toBe(false)
  expect(isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678')).toBe(false)
  expect(isValidImageName('')).toBe(false)
})

test('サイズ上限は 10MB', () => {
  expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024)
})

const PNG_HEAD = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_HEAD = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
const GIF_HEAD = new TextEncoder().encode('GIF89a')
const WEBP_HEAD = new TextEncoder().encode('RIFF\0\0\0\0WEBP')

// ISO-BMFF (HEIC/AVIF) の ftyp ボックスを手で組む。
// 構造: size(4) + "ftyp"(4) + major brand(4) + minor version(4) + compatible brands(4*n)
function ftypBox(major: string, compatible: string[]): Uint8Array {
  const enc = new TextEncoder()
  const size = 8 + 4 + 4 + compatible.length * 4
  const buf = new Uint8Array(size)
  new DataView(buf.buffer).setUint32(0, size) // ボックス長 (big-endian)
  buf.set(enc.encode('ftyp'), 4)
  buf.set(enc.encode(major), 8)
  // minor version (12..16) は 0 のまま
  compatible.forEach((brand, i) => buf.set(enc.encode(brand), 16 + i * 4))
  return buf
}

test('先頭バイトから画像形式を判定する (sniff)', () => {
  expect(sniffImageFormat(PNG_HEAD)).toBe('png')
  expect(sniffImageFormat(JPEG_HEAD)).toBe('jpg')
  expect(sniffImageFormat(GIF_HEAD)).toBe('gif')
  expect(sniffImageFormat(WEBP_HEAD)).toBe('webp')
})

test('TIFF は big/little endian の両署名を判定する', () => {
  expect(sniffImageFormat(new TextEncoder().encode('II*\0'))).toBe('tiff') // little
  expect(sniffImageFormat(Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a]))).toBe('tiff') // big
})

test('HEIC は ftyp のブランドで判定する', () => {
  expect(sniffImageFormat(ftypBox('heic', ['heic', 'mif1']))).toBe('heic')
  expect(sniffImageFormat(ftypBox('heix', ['heix', 'mif1']))).toBe('heic')
  // iPhone / Nokia サンプルは major=mif1、compatible に heic が入る形
  expect(sniffImageFormat(ftypBox('mif1', ['mif1', 'heic']))).toBe('heic')
})

test('AVIF は ftyp のブランドで判定する (mif1 兼用でも avif を優先)', () => {
  expect(sniffImageFormat(ftypBox('avif', ['avif', 'mif1']))).toBe('avif')
  expect(sniffImageFormat(ftypBox('avis', ['avis', 'avif']))).toBe('avif')
  // major=mif1 でも compatible に avif があれば AVIF (heic より優先して判定)
  expect(sniffImageFormat(ftypBox('mif1', ['mif1', 'avif']))).toBe('avif')
})

test('画像でない・未対応の中身は null (形式判定)', () => {
  const html = new TextEncoder().encode('<html><script>alert(1)</script>')
  expect(sniffImageFormat(html)).toBeNull()
  expect(sniffImageFormat(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
  expect(sniffImageFormat(new Uint8Array(0))).toBeNull()
  // ftyp だが未知ブランド (mp4 動画など) は画像として扱わない
  expect(sniffImageFormat(ftypBox('isom', ['isom', 'mp42']))).toBeNull()
})

test('切り詰めた入力でも throw しない (呼び出し側は try/catch しない)', () => {
  // ftyp を名乗る途中で切れたバイト列で例外を出さないこと。
  // sniffImageFormat は route / coverLookup が素で呼ぶので、throw すると
  // アップロードが 500 になり、書影取得は「throw しない」契約を破る。
  // major brand が揃う 12 バイト未満は null、揃えば形式が返る (どちらも throw しない)
  const ftypPrefix = new TextEncoder().encode('\0\0\0\x18ftypheic')
  for (let len = 0; len <= 16; len++) {
    const slice = ftypPrefix.subarray(0, len)
    expect(() => sniffImageFormat(slice)).not.toThrow()
    if (len < 12) {
      expect(sniffImageFormat(slice)).toBeNull() // major brand まで揃っていない
    }
  }
})

// --- 音声 (docs/12-添付ファイル種類拡張メモ.md) ---

test('先頭バイトから音声形式を判定する (mp3/wav/m4a)', () => {
  // mp3: ID3v2 タグ始まり
  expect(sniffAudioFormat(new TextEncoder().encode('ID3\x04\x00'))).toBe('mp3')
  // mp3: ID3 無しの生フレーム同期語 (0xFF 0xFB)
  expect(sniffAudioFormat(Uint8Array.from([0xff, 0xfb, 0x90, 0x00]))).toBe('mp3')
  // wav: RIFF....WAVE
  expect(sniffAudioFormat(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))).toBe('wav')
  // m4a: ISO-BMFF の ftyp に音声ブランド (iPhone ボイスメモは "M4A ")
  expect(sniffAudioFormat(ftypBox('M4A ', ['M4A ', 'mp42', 'isom']))).toBe('m4a')
  expect(sniffAudioFormat(ftypBox('M4B ', ['M4B ']))).toBe('m4a')
})

test('音声でない・動画の ftyp は null (音声判定)', () => {
  // 画像 (PNG) は音声ではない
  expect(sniffAudioFormat(PNG_HEAD)).toBeNull()
  // JPEG (FF D8) は mp3 の同期語 (FF E0 マスク) と衝突しない
  expect(sniffAudioFormat(JPEG_HEAD)).toBeNull()
  // 動画の ftyp (mp42/isom 単独) は音声として受けない
  expect(sniffAudioFormat(ftypBox('isom', ['isom', 'mp42']))).toBeNull()
  expect(sniffAudioFormat(new TextEncoder().encode('<html>'))).toBeNull()
  expect(sniffAudioFormat(new Uint8Array(0))).toBeNull()
})

test('画像と音声の判定は互いに混ざらない', () => {
  // 画像判定は音声を拾わない
  expect(sniffImageFormat(new TextEncoder().encode('ID3\x04\x00'))).toBeNull()
  expect(sniffImageFormat(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))).toBeNull()
  expect(sniffImageFormat(ftypBox('M4A ', ['M4A ']))).toBeNull()
})

test('音声形式を保存用の mime / ext に写す', () => {
  expect(audioSaveInfo('mp3')).toEqual({ mime: 'audio/mpeg', ext: 'mp3' })
  expect(audioSaveInfo('m4a')).toEqual({ mime: 'audio/mp4', ext: 'm4a' })
  expect(audioSaveInfo('wav')).toEqual({ mime: 'audio/wav', ext: 'wav' })
})

test('音声の保存名 (UUID + mp3/m4a/wav) を許可する', () => {
  const uuid = '0f1e2d3c-4b5a-4678-9abc-def012345678'
  expect(isValidAudioName(`${uuid}.mp3`)).toBe(true)
  expect(isValidAudioName(`${uuid}.m4a`)).toBe(true)
  expect(isValidAudioName(`${uuid}.wav`)).toBe(true)
  expect(isValidAudioName(`${uuid}.png`)).toBe(false) // 画像は音声名ではない
  expect(isValidAudioName('../../etc/passwd.mp3')).toBe(false)
})

test('isValidImageName は音声名を拾わない (一覧サムネ・画像検索に混ぜない)', () => {
  const uuid = '0f1e2d3c-4b5a-4678-9abc-def012345678'
  expect(isValidImageName(`${uuid}.mp3`)).toBe(false)
  expect(isValidImageName(`${uuid}.m4a`)).toBe(false)
  expect(isValidImageName(`${uuid}.wav`)).toBe(false)
})

test('isValidAttachmentName は画像・音声の両方を許可する', () => {
  const uuid = '0f1e2d3c-4b5a-4678-9abc-def012345678'
  expect(isValidAttachmentName(`${uuid}.png`)).toBe(true)
  expect(isValidAttachmentName(`${uuid}.mp3`)).toBe(true)
  expect(isValidAttachmentName(`${uuid}.svg`)).toBe(false)
  expect(isValidAttachmentName('../secret.mp3')).toBe(false)
})

test('配信 Content-Type は既知の画像・音声・PDF mime だけ採用する', () => {
  expect(isAllowedContentMime('image/png')).toBe(true)
  expect(isAllowedContentMime('image/webp')).toBe(true)
  expect(isAllowedContentMime('audio/mpeg')).toBe(true)
  expect(isAllowedContentMime('audio/mp4')).toBe(true)
  expect(isAllowedContentMime('audio/wav')).toBe(true)
  expect(isAllowedContentMime(PDF_MIME)).toBe(true)
  // 未知・危険な mime は採用しない (route.ts が octet-stream に落とす)
  expect(isAllowedContentMime('image/svg+xml')).toBe(false)
  expect(isAllowedContentMime('text/html')).toBe(false)
  expect(isAllowedContentMime('video/mp4')).toBe(false)
})

// --- PDF (docs/12-添付ファイル種類拡張メモ.md) ---

test('先頭が "%PDF-" なら PDF と判定する', () => {
  expect(sniffPdf(new TextEncoder().encode('%PDF-1.7\n%âãÏÓ'))).toBe(true)
  expect(sniffPdf(new TextEncoder().encode('%PDF-1.4'))).toBe(true)
})

test('PDF でない中身・先頭がずれた PDF は false', () => {
  // 署名は offset 0 固定。前に何か付いたポリグロットは受けない
  expect(sniffPdf(new TextEncoder().encode('\n%PDF-1.7'))).toBe(false)
  expect(sniffPdf(new TextEncoder().encode('%PDX-1.7'))).toBe(false)
  expect(sniffPdf(new TextEncoder().encode('<html>'))).toBe(false)
  expect(sniffPdf(PNG_HEAD)).toBe(false)
  expect(sniffPdf(new Uint8Array(0))).toBe(false)
})

test('PDF は画像・音声の判定に混ざらない', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7')
  expect(sniffImageFormat(pdf)).toBeNull()
  expect(sniffAudioFormat(pdf)).toBeNull()
})

test('PDF の保存名 (UUID + .pdf) を許可する', () => {
  const uuid = '0f1e2d3c-4b5a-4678-9abc-def012345678'
  expect(isValidPdfName(`${uuid}.pdf`)).toBe(true)
  expect(isValidPdfName(`${uuid}.png`)).toBe(false)
  expect(isValidPdfName('../../etc/passwd.pdf')).toBe(false)
  expect(isValidPdfName('a.pdf')).toBe(false) // UUID 形式でない
})

test('isValidImageName は PDF 名を拾わない (一覧サムネ・画像検索に混ぜない)', () => {
  const uuid = '0f1e2d3c-4b5a-4678-9abc-def012345678'
  expect(isValidImageName(`${uuid}.pdf`)).toBe(false)
})

test('isValidAttachmentName は PDF も許可する', () => {
  const uuid = '0f1e2d3c-4b5a-4678-9abc-def012345678'
  expect(isValidAttachmentName(`${uuid}.pdf`)).toBe(true)
  expect(isValidAttachmentName('../secret.pdf')).toBe(false)
})

function uploadRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/images', {
    method: 'POST',
    body: new FormData(),
    headers,
  })
}

test('Origin がないリクエスト (curl 等) は通す', () => {
  expect(checkUploadRequest(uploadRequest({ host: 'localhost' }))).toBeNull()
})

test('同一オリジンの POST は通す', () => {
  const request = uploadRequest({ origin: 'http://localhost', host: 'localhost' })
  expect(checkUploadRequest(request)).toBeNull()
})

test('クロスオリジンの POST は 403 で弾く (CSRF)', () => {
  const request = uploadRequest({
    origin: 'https://evil.example.com',
    host: 'localhost',
  })
  expect(checkUploadRequest(request)?.status).toBe(403)
})

test('Origin が壊れていても例外にせず 403 で弾く', () => {
  const request = uploadRequest({ origin: 'not-a-url', host: 'localhost' })
  expect(checkUploadRequest(request)?.status).toBe(403)
})

test('Content-Length が上限を超えていれば本文を読まず 413 で弾く', () => {
  const request = uploadRequest({
    host: 'localhost',
    'content-length': String(100 * 1024 * 1024),
  })
  expect(checkUploadRequest(request)?.status).toBe(413)
})

test('Content-Length が上限内なら通す', () => {
  const request = uploadRequest({
    host: 'localhost',
    'content-length': String(1024),
  })
  expect(checkUploadRequest(request)).toBeNull()
})
