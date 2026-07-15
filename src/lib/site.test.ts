import { afterEach, expect, test, vi } from 'vitest'
import { qrBaseUrl, qrStickerHost } from './site'

const original = process.env.QR_BASE_URL

afterEach(() => {
  process.env.QR_BASE_URL = original
  vi.restoreAllMocks()
})

test('QR_BASE_URL をそのまま使う', () => {
  process.env.QR_BASE_URL = 'https://parts.example.com'
  expect(qrBaseUrl()).toBe('https://parts.example.com')
  expect(qrStickerHost()).toBe('parts.example.com')
})

test('未設定なら既定へ倒す', () => {
  delete process.env.QR_BASE_URL
  expect(qrStickerHost()).toBe('qr.tommie.jp')
})

test('空文字 (.env に `QR_BASE_URL=` と書いた形) でも既定へ倒す', () => {
  // ?? だとここで空文字が素通しされ、new URL('') が投げてトップpage が 500 になる
  process.env.QR_BASE_URL = ''
  expect(qrBaseUrl()).toBe('https://qr.tommie.jp')
  expect(qrStickerHost()).toBe('qr.tommie.jp')
})

test('URL として壊れていても投げず、既定へ倒して警告する', () => {
  // scheme を書き忘れた形。印刷設定の不備で検索まで落とさない
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  process.env.QR_BASE_URL = 'qr.tommie.jp'
  expect(qrStickerHost()).toBe('qr.tommie.jp')
  expect(warn).toHaveBeenCalledOnce()
})
