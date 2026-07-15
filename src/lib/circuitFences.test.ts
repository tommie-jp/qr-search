import { describe, expect, test } from 'vitest'
import { extractCircuitSources } from './circuitFences'

describe('extractCircuitSources', () => {
  test('extracts a circuitikz fence', () => {
    const md = '前置き\n\n```circuitikz\n\\draw (0,0) to[R] (2,0);\n```\n'
    expect(extractCircuitSources(md)).toEqual(['\\draw (0,0) to[R] (2,0);'])
  })

  test('ignores other languages', () => {
    const md = '```mermaid\ngraph TD; A-->B;\n```\n\n```bash\nls\n```\n'
    expect(extractCircuitSources(md)).toEqual([])
  })

  test('extracts multiple fences in order', () => {
    const md = '```circuitikz\nA\n```\n\ntext\n\n```circuitikz\nB\n```\n'
    expect(extractCircuitSources(md)).toEqual(['A', 'B'])
  })

  test('deduplicates identical sources', () => {
    const md = '```circuitikz\nA\n```\n\n```circuitikz\nA\n```\n'
    expect(extractCircuitSources(md)).toEqual(['A'])
  })

  test('finds fences nested in lists and quotes', () => {
    const md = '- 項目\n\n  ```circuitikz\n  A\n  ```\n'
    expect(extractCircuitSources(md)).toEqual(['A'])
  })

  // インデントや言語指定の揺れは react-markdown と同じ解釈にしたいので
  // 正規表現ではなく remark でパースしている
  test('ignores a circuitikz fence inside a larger code fence', () => {
    const md = '````markdown\n```circuitikz\nA\n```\n````\n'
    expect(extractCircuitSources(md)).toEqual([])
  })

  test('returns an empty list for markdown without fences', () => {
    expect(extractCircuitSources('ただのメモ #タグ')).toEqual([])
  })
})
