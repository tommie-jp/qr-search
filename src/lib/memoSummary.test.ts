import { expect, test } from 'vitest'
import { memoSummary } from './memoSummary'

test('プレーンテキストは先頭行をそのまま返す', () => {
  expect(memoSummary('USB充電器 65W JACESS\n\nOutput:\n5V - 3A')).toBe(
    'USB充電器 65W JACESS',
  )
})

test('見出し記法を除去する', () => {
  expect(memoSummary('# タイトル\n本文')).toBe('タイトル')
})

test('リスト記法を除去する', () => {
  expect(memoSummary('- 項目1\n- 項目2')).toBe('項目1')
  expect(memoSummary('1. 項目1')).toBe('項目1')
})

test('チェックボックス記法を除去する', () => {
  expect(memoSummary('- [x] 完了タスク')).toBe('完了タスク')
})

test('強調・インラインコードの記号を除去する', () => {
  expect(memoSummary('**太字** と `code` と ~~取消~~')).toBe('太字 と code と 取消')
})

test('リンク・画像はテキストだけ残す', () => {
  expect(memoSummary('[説明](https://example.com)')).toBe('説明')
  expect(memoSummary('![代替テキスト](/img.png)')).toBe('代替テキスト')
})

test('コードフェンスの区切り行はスキップする', () => {
  expect(memoSummary('```mermaid\ngraph TD;\n```')).toBe('graph TD;')
})

test('先頭の空行・引用記法を飛ばす', () => {
  expect(memoSummary('\n\n> 引用文')).toBe('引用文')
})

test('部品名のアンダースコアはそのまま残す', () => {
  expect(memoSummary('ABC_DEF_100x')).toBe('ABC_DEF_100x')
})

test('空メモは空文字を返す', () => {
  expect(memoSummary('')).toBe('')
  expect(memoSummary('\n  \n')).toBe('')
})
