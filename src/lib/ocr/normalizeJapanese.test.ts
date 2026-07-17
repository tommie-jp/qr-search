import { expect, test } from 'vitest'
import { CJK_NORMALIZE_MAP, normalizeToJapanese } from './normalizeJapanese'

test('簡体字を日本語新字体へ寄せる', () => {
  expect(normalizeToJapanese('单')).toBe('単')
  expect(normalizeToJapanese('类')).toBe('類')
  expect(normalizeToJapanese('图')).toBe('図')
})

test('繁体字も日本語新字体へ寄せる', () => {
  expect(normalizeToJapanese('單')).toBe('単')
  expect(normalizeToJapanese('類')).toBe('類')
})

test('文中の対象文字だけを置換し、他はそのまま残す', () => {
  // かな・英数字・記号・元から日本語の漢字はそのまま
  expect(normalizeToJapanese('抵抗器 单体 12V')).toBe('抵抗器 単体 12V')
})

test('日本語でそのまま使う漢字は変えない (恒等写像を持たない)', () => {
  for (const ch of '会国学時間電気部品冷却') {
    expect(normalizeToJapanese(ch)).toBe(ch)
  }
})

test('空文字はそのまま空文字', () => {
  expect(normalizeToJapanese('')).toBe('')
})

test('サロゲートペア (絵文字) を壊さない', () => {
  expect(normalizeToJapanese('部品😀单')).toBe('部品😀単')
})

test('表は左辺 (変換元) と右辺 (変換先) が必ず別の字 (恒等写像がない)', () => {
  for (const [from, to] of CJK_NORMALIZE_MAP) {
    expect(from).not.toBe(to)
  }
})
