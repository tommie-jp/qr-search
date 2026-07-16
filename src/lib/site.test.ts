import { afterEach, expect, test, vi } from 'vitest'
import { qrBaseUrl, qrStickerHost, siteTitle } from './site'

const original = process.env.QR_BASE_URL
const originalAppEnv = process.env.APP_ENV

afterEach(() => {
  process.env.QR_BASE_URL = original
  if (originalAppEnv === undefined) {
    delete process.env.APP_ENV
  } else {
    process.env.APP_ENV = originalAppEnv
  }
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

// タブを並べているときは背景色が見えないため、誤認を防げるのはタイトルだけになる
test('本番のタイトルは素のサイト名', () => {
  process.env.APP_ENV = 'production'
  expect(siteTitle()).toBe('QR search')
})

test('非本番のタイトルは [LOCAL] を冠する', () => {
  delete process.env.APP_ENV
  expect(siteTitle()).toBe('[LOCAL] QR search')
})

test('URL として壊れていても投げず、既定へ倒して警告する', () => {
  // scheme を書き忘れた形。印刷設定の不備で検索まで落とさない
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  process.env.QR_BASE_URL = 'qr.tommie.jp'
  expect(qrStickerHost()).toBe('qr.tommie.jp')
  expect(warn).toHaveBeenCalledOnce()
})
