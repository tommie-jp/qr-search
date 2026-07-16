import { describe, expect, test } from 'vitest'
import { parseBackUrl, parseSelectedItemNos } from './itemSelection'

function form(entries: Array<[string, string]>): FormData {
  const fd = new FormData()
  for (const [key, value] of entries) {
    fd.append(key, value)
  }
  return fd
}

describe('parseSelectedItemNos', () => {
  test('選択された itemNo をフォーム順で返す', () => {
    expect(parseSelectedItemNos(form([['itemNo', '1'], ['itemNo', '2']]))).toEqual(['1', '2'])
  })

  test('不正な itemNo を除き、重複はまとめる', () => {
    const fd = form([
      ['itemNo', '1'],
      ['itemNo', '1'],
      ['itemNo', 'bad id!'],
      ['itemNo', '2'],
    ])
    expect(parseSelectedItemNos(fd)).toEqual(['1', '2'])
  })

  test('選択が無ければ空', () => {
    expect(parseSelectedItemNos(form([]))).toEqual([])
  })

  test('異常に多い itemNo は上限で打ち切る (DoS 防御)', () => {
    const fd = form(Array.from({ length: 300 }, (_, i): [string, string] => ['itemNo', `${i}`]))
    expect(parseSelectedItemNos(fd).length).toBe(100)
  })
})

describe('parseBackUrl', () => {
  test('q / page / sort が無ければ一覧の先頭', () => {
    expect(parseBackUrl(form([]))).toBe('/')
  })

  test('q / page / sort を反映する', () => {
    const fd = form([
      ['q', '抵抗'],
      ['page', '3'],
      ['sort', 'itemNo'],
    ])
    expect(parseBackUrl(fd)).toBe('/?q=%E6%8A%B5%E6%8A%97&page=3&sort=itemNo')
  })

  test('壊れた page は 1 ページ目にする', () => {
    expect(parseBackUrl(form([['page', 'abc']]))).toBe('/')
  })

  // back は必ずここで組み立て、フォームの値をそのまま redirect 先にしない
  // (任意の URL を受け取るとオープンリダイレクトになる)
  test('フォームの任意 URL は戻り先にならない', () => {
    const fd = form([
      ['back', 'https://evil.example.com'],
      ['q', 'x'],
    ])
    expect(parseBackUrl(fd)).toBe('/?q=x')
  })
})
