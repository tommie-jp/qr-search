import { describe, expect, test } from 'vitest'
import { MAX_SEARCH_TERMS, splitSearchTerms } from './search'

describe('splitSearchTerms', () => {
  test('splits on a half-width space (AND search)', () => {
    expect(splitSearchTerms('抵抗 1608')).toEqual(['抵抗', '1608'])
  })

  test('splits on a full-width space (全角スペース)', () => {
    expect(splitSearchTerms('ライト　RITEX')).toEqual(['ライト', 'RITEX'])
  })

  test('collapses consecutive and mixed whitespace', () => {
    expect(splitSearchTerms('  抵抗　　\t1608  ')).toEqual(['抵抗', '1608'])
  })

  test('returns a single term when there is no whitespace', () => {
    expect(splitSearchTerms('ライト')).toEqual(['ライト'])
  })

  test('returns an empty array for empty or whitespace-only input', () => {
    expect(splitSearchTerms('')).toEqual([])
    expect(splitSearchTerms('   　 ')).toEqual([])
  })

  test('de-duplicates repeated terms to avoid redundant conditions', () => {
    expect(splitSearchTerms('ライト ライト')).toEqual(['ライト'])
  })

  test('caps the number of terms to MAX_SEARCH_TERMS', () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')
    expect(splitSearchTerms(many)).toHaveLength(MAX_SEARCH_TERMS)
  })
})
