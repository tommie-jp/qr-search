import { describe, expect, test } from 'vitest'
import {
  buildItemUrl,
  escapeLike,
  isValidItemNo,
  itemNoToNum,
  parseMode,
  parseSort,
} from './validation'

describe('isValidItemNo', () => {
  test('accepts a typical 4-digit itemNo', () => {
    expect(isValidItemNo('1003')).toBe(true)
  })

  test('accepts legacy non-numeric itemNo like "100x"', () => {
    expect(isValidItemNo('100x')).toBe(true)
  })

  test('accepts a single digit', () => {
    expect(isValidItemNo('1')).toBe(true)
  })

  test('rejects empty string', () => {
    expect(isValidItemNo('')).toBe(false)
  })

  test('rejects strings longer than 20 chars', () => {
    expect(isValidItemNo('1'.repeat(21))).toBe(false)
  })

  test('rejects path traversal and separators', () => {
    expect(isValidItemNo('../etc')).toBe(false)
    expect(isValidItemNo('a/b')).toBe(false)
  })

  test('rejects whitespace', () => {
    expect(isValidItemNo('10 03')).toBe(false)
  })
})

describe('itemNoToNum', () => {
  test('converts numeric string to number', () => {
    expect(itemNoToNum('1003')).toBe(1003)
  })

  test('returns null for non-numeric itemNo', () => {
    expect(itemNoToNum('100x')).toBeNull()
  })

  test('converts "6000" (largest in ver1 data)', () => {
    expect(itemNoToNum('6000')).toBe(6000)
  })

  test('returns int4 max as-is', () => {
    expect(itemNoToNum('2147483647')).toBe(2147483647)
  })

  test('returns null for values exceeding int4 range (DB column is Int)', () => {
    expect(itemNoToNum('2147483648')).toBeNull()
    expect(itemNoToNum('12345678901')).toBeNull()
  })
})

describe('escapeLike', () => {
  test('escapes percent and underscore', () => {
    expect(escapeLike('100_')).toBe('100\\_')
    expect(escapeLike('50%')).toBe('50\\%')
  })

  test('escapes backslash itself', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  test('leaves plain text unchanged', () => {
    expect(escapeLike('抵抗 10k')).toBe('抵抗 10k')
  })
})

describe('parseMode', () => {
  test('returns "url" for "url"', () => {
    expect(parseMode('url')).toBe('url')
  })

  test('returns "memo" for "memo"', () => {
    expect(parseMode('memo')).toBe('memo')
  })

  test('defaults to "memo" for undefined (ver1 behavior)', () => {
    expect(parseMode(undefined)).toBe('memo')
  })

  test('defaults to "memo" for unknown values', () => {
    expect(parseMode('other')).toBe('memo')
    expect(parseMode(null)).toBe('memo')
  })
})

describe('parseSort', () => {
  test('returns "updated" for "updated"', () => {
    expect(parseSort('updated')).toBe('updated')
  })

  test('defaults to "itemNo" for undefined or unknown values', () => {
    expect(parseSort(undefined)).toBe('itemNo')
    expect(parseSort('other')).toBe('itemNo')
    expect(parseSort(null)).toBe('itemNo')
  })
})

describe('buildItemUrl', () => {
  test('builds the QR target URL', () => {
    expect(buildItemUrl('https://qr.tommie.jp', '1003')).toBe(
      'https://qr.tommie.jp/item/1003',
    )
  })

  test('tolerates trailing slash in base URL', () => {
    expect(buildItemUrl('https://qr.tommie.jp/', '1003')).toBe(
      'https://qr.tommie.jp/item/1003',
    )
  })
})
