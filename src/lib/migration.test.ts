import { describe, expect, test } from 'vitest'
import { dedupeVer1Items, transformVer1Item } from './migration'
import type { Ver1ItemDoc } from './migration'

const doc = (overrides: Partial<Ver1ItemDoc>): Ver1ItemDoc => ({
  itemNo: '1003',
  memo: 'memo',
  url: '',
  createdAt: { $date: '2016-07-06T14:46:26.260Z' },
  updatedAt: { $date: '2016-07-16T13:52:43.011Z' },
  ...overrides,
})

describe('transformVer1Item', () => {
  test('normalizes number itemNo to string and derives itemNoNum', () => {
    const item = transformVer1Item(doc({ itemNo: 1003 }))
    expect(item.itemNo).toBe('1003')
    expect(item.itemNoNum).toBe(1003)
  })

  test('keeps non-numeric itemNo with null itemNoNum', () => {
    const item = transformVer1Item(doc({ itemNo: '100x' }))
    expect(item.itemNo).toBe('100x')
    expect(item.itemNoNum).toBeNull()
  })

  test('defaults missing mode to "memo" (ver1 behavior)', () => {
    expect(transformVer1Item(doc({})).mode).toBe('memo')
    expect(transformVer1Item(doc({ mode: 'url' })).mode).toBe('url')
  })

  test('defaults missing memo and url to empty strings', () => {
    const item = transformVer1Item(doc({ memo: undefined, url: undefined }))
    expect(item.memo).toBe('')
    expect(item.url).toBe('')
  })

  test('preserves original timestamps', () => {
    const item = transformVer1Item(doc({}))
    expect(item.createdAt.toISOString()).toBe('2016-07-06T14:46:26.260Z')
    expect(item.updatedAt.toISOString()).toBe('2016-07-16T13:52:43.011Z')
  })

  test('preserves CRLF and emoji in memo', () => {
    const memo = '2016/07/13\r\nテスト用メモ\r\n絵文字🎉❤️'
    expect(transformVer1Item(doc({ memo })).memo).toBe(memo)
  })
})

describe('dedupeVer1Items', () => {
  test('prefers the number-typed doc when itemNo duplicates (ver1 display rule)', () => {
    const stringDoc = doc({ itemNo: '1003', memo: 'string 版' })
    const numberDoc = doc({ itemNo: 1003, memo: 'number 版' })
    const { winners, skipped } = dedupeVer1Items([stringDoc, numberDoc])
    expect(winners).toHaveLength(1)
    expect(winners[0].memo).toBe('number 版')
    expect(skipped).toHaveLength(1)
    expect(skipped[0].memo).toBe('string 版')
  })

  test('keeps unique items as-is', () => {
    const docs = [doc({ itemNo: '100x' }), doc({ itemNo: 2000 })]
    const { winners, skipped } = dedupeVer1Items(docs)
    expect(winners).toHaveLength(2)
    expect(skipped).toHaveLength(0)
  })

  test('same-type duplicates keep the newest updatedAt', () => {
    const older = doc({
      itemNo: 3000,
      memo: 'old',
      updatedAt: { $date: '2016-01-01T00:00:00.000Z' },
    })
    const newer = doc({
      itemNo: 3000,
      memo: 'new',
      updatedAt: { $date: '2020-01-01T00:00:00.000Z' },
    })
    const { winners, skipped } = dedupeVer1Items([older, newer])
    expect(winners).toHaveLength(1)
    expect(winners[0].memo).toBe('new')
    expect(skipped[0].memo).toBe('old')
  })
})
