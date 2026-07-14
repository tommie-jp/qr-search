import { describe, expect, test } from 'vitest'
import {
  MAX_SEARCH_TERMS,
  parseSearchQuery,
  splitSearchTerms,
  type SearchTerm,
} from './search'

// テストを読みやすくするための語ビルダ。
const t = (value: string): SearchTerm => ({ kind: 'text', value })
const tag = (value: string): SearchTerm => ({ kind: 'tag', value })

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
    expect(parseSearchQuery('抵抗 1608')).toEqual([[t('抵抗'), t('1608')]])
  })

  test('empty / whitespace-only input yields no groups', () => {
    expect(parseSearchQuery('')).toEqual([])
    expect(parseSearchQuery('   　 ')).toEqual([])
  })

  describe('OR keyword', () => {
    test('splits two terms into separate groups', () => {
      expect(parseSearchQuery('抵抗 OR コンデンサ')).toEqual([
        [t('抵抗')],
        [t('コンデンサ')],
      ])
    })

    test('splits three terms', () => {
      expect(parseSearchQuery('A OR B OR C')).toEqual([[t('A')], [t('B')], [t('C')]])
    })

    test('is case-insensitive (or / Or / oR)', () => {
      expect(parseSearchQuery('a or b')).toEqual([[t('a')], [t('b')]])
      expect(parseSearchQuery('a Or b')).toEqual([[t('a')], [t('b')]])
      expect(parseSearchQuery('a oR b')).toEqual([[t('a')], [t('b')]])
    })

    test('space binds tighter than OR (space=AND, OR looser)', () => {
      expect(parseSearchQuery('抵抗 1608 OR コンデンサ')).toEqual([
        [t('抵抗'), t('1608')],
        [t('コンデンサ')],
      ])
    })

    test('drops empty operands (A OR / OR A)', () => {
      expect(parseSearchQuery('A OR')).toEqual([[t('A')]])
      expect(parseSearchQuery('OR A')).toEqual([[t('A')]])
      expect(parseSearchQuery('A OR OR B')).toEqual([[t('A')], [t('B')]])
    })
  })

  describe('pipe operator', () => {
    test('splits without surrounding spaces', () => {
      expect(parseSearchQuery('A|B')).toEqual([[t('A')], [t('B')]])
    })

    test('splits three terms', () => {
      expect(parseSearchQuery('A|B|C')).toEqual([[t('A')], [t('B')], [t('C')]])
    })

    test('splits with surrounding spaces too', () => {
      expect(parseSearchQuery('A | B')).toEqual([[t('A')], [t('B')]])
    })

    test('drops empty operands (A|| B, |A, A|)', () => {
      expect(parseSearchQuery('A||B')).toEqual([[t('A')], [t('B')]])
      expect(parseSearchQuery('|A')).toEqual([[t('A')]])
      expect(parseSearchQuery('A|')).toEqual([[t('A')]])
    })

    test('mixes with space-AND', () => {
      expect(parseSearchQuery('抵抗 1608|コンデンサ')).toEqual([
        [t('抵抗'), t('1608')],
        [t('コンデンサ')],
      ])
    })
  })

  describe('double-quoted literals', () => {
    test('"or" is a literal term, not the OR operator', () => {
      expect(parseSearchQuery('"or"')).toEqual([[t('or')]])
    })

    test('quoted "or" inside an AND-group stays literal', () => {
      expect(parseSearchQuery('A "or" B')).toEqual([[t('A'), t('or'), t('B')]])
    })

    test('quotes protect a pipe inside the term', () => {
      expect(parseSearchQuery('"A|B"')).toEqual([[t('A|B')]])
    })

    test('quotes protect whitespace (single term with a space)', () => {
      expect(parseSearchQuery('"A B"')).toEqual([[t('A B')]])
    })

    test('an unterminated quote runs to the end of input', () => {
      expect(parseSearchQuery('"or')).toEqual([[t('or')]])
    })

    test('OR still works alongside quoted literals', () => {
      expect(parseSearchQuery('"or" OR "and"')).toEqual([[t('or')], [t('and')]])
    })
  })

  describe('tag terms', () => {
    test('an unquoted #tag becomes a tag term', () => {
      expect(parseSearchQuery('#抵抗')).toEqual([[tag('抵抗')]])
    })

    test('AND of two tags', () => {
      expect(parseSearchQuery('#tag1 #tag2')).toEqual([[tag('tag1'), tag('tag2')]])
    })

    test('OR of two tags (| and OR)', () => {
      expect(parseSearchQuery('#tag1 | #tag2')).toEqual([[tag('tag1')], [tag('tag2')]])
      expect(parseSearchQuery('#tag1 OR #tag2')).toEqual([[tag('tag1')], [tag('tag2')]])
    })

    test('normalizes the tag name (full-width, case)', () => {
      expect(parseSearchQuery('#ＮＰＮ')).toEqual([[tag('npn')]])
    })

    test('mixes a tag with a full-text term', () => {
      expect(parseSearchQuery('#トランジスタ 2SC1815')).toEqual([
        [tag('トランジスタ'), t('2SC1815')],
      ])
    })

    test('a quoted "#tag" stays a literal full-text term', () => {
      expect(parseSearchQuery('"#tag1"')).toEqual([[t('#tag1')]])
    })

    test('a quoted "#" stays a literal full-text term', () => {
      expect(parseSearchQuery('"#"')).toEqual([[t('#')]])
    })

    test('an unquoted bare # is ignored', () => {
      expect(parseSearchQuery('#')).toEqual([])
      expect(parseSearchQuery('抵抗 #')).toEqual([[t('抵抗')]])
    })

    test('a tag and the same-named text term are distinct', () => {
      expect(parseSearchQuery('#抵抗 "抵抗"')).toEqual([[tag('抵抗'), t('抵抗')]])
    })
  })

  describe('normalization', () => {
    test('de-duplicates terms within a group', () => {
      expect(parseSearchQuery('ライト ライト OR B')).toEqual([[t('ライト')], [t('B')]])
    })

    test('de-duplicates identical groups', () => {
      expect(parseSearchQuery('A OR A')).toEqual([[t('A')]])
    })

    test('caps the total number of terms to MAX_SEARCH_TERMS', () => {
      const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' OR ')
      const groups = parseSearchQuery(many)
      const total = groups.reduce((n, g) => n + g.length, 0)
      expect(total).toBe(MAX_SEARCH_TERMS)
    })
  })
})
