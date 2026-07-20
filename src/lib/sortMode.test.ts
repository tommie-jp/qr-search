import { expect, test } from 'vitest'
import { resolveSort } from './sortMode'

test('URL に指定があればそれを使う', () => {
  expect(resolveSort('accessed', undefined)).toBe('accessed')
  expect(resolveSort('itemNo', undefined)).toBe('itemNo')
})

// 共有されたリンクを開いた人に、自分の好みを混ぜて見せない
test('URL の指定は cookie より優先する', () => {
  expect(resolveSort('itemNo', 'accessed')).toBe('itemNo')
  expect(resolveSort('updated', 'accessed')).toBe('updated')
})

// ヘッダーの「QR search」・検索フォーム・スキャン・タグリンクから入る経路。
// ここで cookie を見るのがこの機能の目的
test('URL に指定が無ければ cookie を使う', () => {
  expect(resolveSort(undefined, 'accessed')).toBe('accessed')
  expect(resolveSort(null, 'itemNo')).toBe('itemNo')
})

test('どちらも無ければ更新順', () => {
  expect(resolveSort(undefined, undefined)).toBe('updated')
  expect(resolveSort(null, null)).toBe('updated')
})

// URL も cookie も利用者が自由に書き換えられる外部入力
test('知らない値は既定へ倒す', () => {
  expect(resolveSort('; DROP TABLE items', undefined)).toBe('updated')
  expect(resolveSort(undefined, 'nonsense')).toBe('updated')
  expect(resolveSort(undefined, { evil: true })).toBe('updated')
})

// 空文字は「指定なし」ではなく不正値として扱われるが、cookie へ倒れずに
// 既定になる。URL に ?sort= と書いた人の意図は「既定で見たい」なので自然
test('空の sort= は既定になる (cookie へは倒れない)', () => {
  expect(resolveSort('', 'accessed')).toBe('updated')
})
