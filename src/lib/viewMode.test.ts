import { expect, test } from 'vitest'
import { DEFAULT_VIEW_MODE, parseViewMode } from './viewMode'

test('card を受け付ける', () => {
  expect(parseViewMode('card')).toBe('card')
})

test('compact を受け付ける', () => {
  expect(parseViewMode('compact')).toBe('compact')
})

test('既定は今までの見た目 (compact)', () => {
  // この機能が入っても、何もしていない人の画面は変わらない
  expect(DEFAULT_VIEW_MODE).toBe('compact')
  expect(parseViewMode(undefined)).toBe('compact')
})

test('知らない値は既定へ畳む', () => {
  // cookie は利用者が自由に書き換えられる外部入力
  expect(parseViewMode('grid')).toBe('compact')
  expect(parseViewMode('')).toBe('compact')
  expect(parseViewMode(null)).toBe('compact')
  expect(parseViewMode(42)).toBe('compact')
  expect(parseViewMode({ toString: () => 'card' })).toBe('compact')
})
