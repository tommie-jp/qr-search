import { expect, test } from 'vitest'
import {
  extForMime,
  isValidImageName,
  matchesMagicBytes,
  MAX_IMAGE_BYTES,
} from './uploads'

test('対応する画像 MIME は拡張子を返す', () => {
  expect(extForMime('image/png')).toBe('png')
  expect(extForMime('image/jpeg')).toBe('jpg')
  expect(extForMime('image/gif')).toBe('gif')
  expect(extForMime('image/webp')).toBe('webp')
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
})

test('パストラバーサル・不正なファイル名を拒否する', () => {
  expect(isValidImageName('../../etc/passwd')).toBe(false)
  expect(isValidImageName('..%2Fsecret.png')).toBe(false)
  expect(isValidImageName('a.png')).toBe(false) // UUID 形式でない
  expect(isValidImageName('0f1e2d3c-4b5a-4678-9abc-def012345678.svg')).toBe(false)
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

test('先頭バイトが拡張子と一致すれば true', () => {
  expect(matchesMagicBytes(PNG_HEAD, 'png')).toBe(true)
  expect(matchesMagicBytes(JPEG_HEAD, 'jpg')).toBe(true)
  expect(matchesMagicBytes(GIF_HEAD, 'gif')).toBe(true)
  expect(matchesMagicBytes(WEBP_HEAD, 'webp')).toBe(true)
})

test('拡張子と中身が食い違う場合は false (MIME 偽装)', () => {
  const html = new TextEncoder().encode('<html><script>alert(1)</script>')
  expect(matchesMagicBytes(html, 'png')).toBe(false)
  expect(matchesMagicBytes(JPEG_HEAD, 'png')).toBe(false)
  expect(matchesMagicBytes(PNG_HEAD, 'webp')).toBe(false)
  expect(matchesMagicBytes(new Uint8Array(0), 'png')).toBe(false)
})
