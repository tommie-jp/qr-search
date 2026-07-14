import { describe, expect, test } from 'vitest'
import { MAX_SEARCH_TERMS, parseSearchQuery, splitSearchTerms } from './search'

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

describe('parseSearchQuery — DNF (OR of AND-groups)', () => {
  test('a plain query is a single AND-group (後方互換)', () => {
    expect(parseSearchQuery('抵抗 1608')).toEqual([['抵抗', '1608']])
  })

  test('empty / whitespace-only input yields no groups', () => {
    expect(parseSearchQuery('')).toEqual([])
    expect(parseSearchQuery('   　 ')).toEqual([])
  })

  describe('OR keyword', () => {
    test('splits two terms into separate groups', () => {
      expect(parseSearchQuery('抵抗 OR コンデンサ')).toEqual([
        ['抵抗'],
        ['コンデンサ'],
      ])
    })

    test('splits three terms', () => {
      expect(parseSearchQuery('A OR B OR C')).toEqual([['A'], ['B'], ['C']])
    })

    test('is case-insensitive (or / Or / oR)', () => {
      expect(parseSearchQuery('a or b')).toEqual([['a'], ['b']])
      expect(parseSearchQuery('a Or b')).toEqual([['a'], ['b']])
      expect(parseSearchQuery('a oR b')).toEqual([['a'], ['b']])
    })

    test('space binds tighter than OR (space=AND, OR looser)', () => {
      expect(parseSearchQuery('抵抗 1608 OR コンデンサ')).toEqual([
        ['抵抗', '1608'],
        ['コンデンサ'],
      ])
    })

    test('drops empty operands (A OR / OR A)', () => {
      expect(parseSearchQuery('A OR')).toEqual([['A']])
      expect(parseSearchQuery('OR A')).toEqual([['A']])
      expect(parseSearchQuery('A OR OR B')).toEqual([['A'], ['B']])
    })
  })

  describe('pipe operator', () => {
    test('splits without surrounding spaces', () => {
      expect(parseSearchQuery('A|B')).toEqual([['A'], ['B']])
    })

    test('splits three terms', () => {
      expect(parseSearchQuery('A|B|C')).toEqual([['A'], ['B'], ['C']])
    })

    test('splits with surrounding spaces too', () => {
      expect(parseSearchQuery('A | B')).toEqual([['A'], ['B']])
    })

    test('drops empty operands (A|| B, |A, A|)', () => {
      expect(parseSearchQuery('A||B')).toEqual([['A'], ['B']])
      expect(parseSearchQuery('|A')).toEqual([['A']])
      expect(parseSearchQuery('A|')).toEqual([['A']])
    })

    test('mixes with space-AND', () => {
      expect(parseSearchQuery('抵抗 1608|コンデンサ')).toEqual([
        ['抵抗', '1608'],
        ['コンデンサ'],
      ])
    })
  })

  describe('double-quoted literals', () => {
    test('"or" is a literal term, not the OR operator', () => {
      expect(parseSearchQuery('"or"')).toEqual([['or']])
    })

    test('quoted "or" inside an AND-group stays literal', () => {
      expect(parseSearchQuery('A "or" B')).toEqual([['A', 'or', 'B']])
    })

    test('quotes protect a pipe inside the term', () => {
      expect(parseSearchQuery('"A|B"')).toEqual([['A|B']])
    })

    test('quotes protect whitespace (single term with a space)', () => {
      expect(parseSearchQuery('"A B"')).toEqual([['A B']])
    })

    test('an unterminated quote runs to the end of input', () => {
      expect(parseSearchQuery('"or')).toEqual([['or']])
    })

    test('OR still works alongside quoted literals', () => {
      expect(parseSearchQuery('"or" OR "and"')).toEqual([['or'], ['and']])
    })
  })

  describe('normalization', () => {
    test('de-duplicates terms within a group', () => {
      expect(parseSearchQuery('ライト ライト OR B')).toEqual([['ライト'], ['B']])
    })

    test('de-duplicates identical groups', () => {
      expect(parseSearchQuery('A OR A')).toEqual([['A']])
    })

    test('caps the total number of terms to MAX_SEARCH_TERMS', () => {
      const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' OR ')
      const groups = parseSearchQuery(many)
      const total = groups.reduce((n, g) => n + g.length, 0)
      expect(total).toBe(MAX_SEARCH_TERMS)
    })
  })
})
