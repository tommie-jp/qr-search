import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  clearLogBuffer,
  installConsoleCapture,
  LOG_BUFFER_SIZE,
  LOG_TEXT_LIMIT,
  recentLogs,
  uninstallConsoleCapture,
} from './logBuffer'

// 本物の console を包むテストなので、出力が試験の画面を汚さないよう
// 「元の console」を先に黙らせてから包む
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  installConsoleCapture()
})

afterEach(() => {
  uninstallConsoleCapture()
  clearLogBuffer()
  vi.restoreAllMocks()
})

test('warn と error を控え、元の console にも流す', () => {
  console.warn('書影を取得できませんでした')
  console.error('書影を保存できませんでした')

  const logs = recentLogs()
  expect(logs).toHaveLength(2)
  // 新しい順 (画面は最新が知りたい)
  expect(logs[0].level).toBe('error')
  expect(logs[0].text).toContain('保存できません')
  expect(logs[1].level).toBe('warn')
  // ssh + docker compose logs の一次調査を殺さない
  expect(warnSpy).toHaveBeenCalledTimes(1)
  expect(errorSpy).toHaveBeenCalledTimes(1)
})

test('複数の引数は空白で繋ぎ、Error は message を採る', () => {
  console.warn('openBD から書影を取得できませんでした (isbn=978…)', new Error('HTTP 503'))
  expect(recentLogs()[0].text).toBe(
    'openBD から書影を取得できませんでした (isbn=978…) HTTP 503',
  )
})

test('オブジェクトは JSON にする。文字列化に失敗しても拾う側は落ちない', () => {
  console.warn('応答:', { count: 0 })
  expect(recentLogs()[0].text).toBe('応答: {"count":0}')

  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic // JSON.stringify が投げる
  console.warn('循環:', cyclic)
  expect(recentLogs()[0].text).toContain('循環:')
})

test('上限を超えたら古いものから捨てる', () => {
  for (let i = 0; i < LOG_BUFFER_SIZE + 10; i += 1) {
    console.warn(`entry-${i}`)
  }
  const logs = recentLogs()
  expect(logs).toHaveLength(LOG_BUFFER_SIZE)
  expect(logs[0].text).toBe(`entry-${LOG_BUFFER_SIZE + 9}`) // 最新は残る
  expect(logs.at(-1)?.text).toBe('entry-10') // 最古の 10 件が消えた
})

test('長すぎる 1 件は切り詰める (バッファをメモリで溢れさせない)', () => {
  console.warn('x'.repeat(LOG_TEXT_LIMIT * 2))
  expect(recentLogs()[0].text.length).toBeLessThanOrEqual(LOG_TEXT_LIMIT)
})

test('二重に install しても包みは 1 重 (dev のホットリロード対策)', () => {
  installConsoleCapture() // beforeEach と合わせて 2 回目
  console.warn('一度だけ')
  expect(recentLogs()).toHaveLength(1)
  expect(warnSpy).toHaveBeenCalledTimes(1) // 元の console にも 1 回だけ
})

test('uninstall で元の console に戻る (テストの後始末)', () => {
  uninstallConsoleCapture()
  console.warn('包みが外れた後')
  expect(recentLogs()).toHaveLength(0)
})
