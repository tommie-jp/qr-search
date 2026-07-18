import { describe, expect, test } from 'vitest'

import { orderOcrItems, type OcrItemLike } from './orderOcrItems'

// 矩形 1 つを OCR 結果の item に見立てる (poly は左上→右上→右下→左下)。
function box(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
): OcrItemLike {
  return {
    text,
    poly: [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
  }
}

describe('orderOcrItems', () => {
  test('returns empty array when there are no items', () => {
    expect(orderOcrItems([])).toEqual([])
  })

  test('sorts horizontal text top to bottom', () => {
    // 縦に積まれた横長の行。検出順はばらばらでも上から順に並ぶ。
    const items = [
      box('2 行目', 10, 100, 200, 30),
      box('1 行目', 10, 10, 200, 30),
      box('3 行目', 10, 190, 200, 30),
    ]

    expect(orderOcrItems(items)).toEqual(['1 行目', '2 行目', '3 行目'])
  })

  test('sorts items on the same horizontal line left to right', () => {
    // 同じ行に並ぶ 2 つの箱 (y がほぼ同じ) は左→右。
    const items = [
      box('右', 300, 12, 200, 30),
      box('左', 10, 10, 200, 30),
    ]

    expect(orderOcrItems(items)).toEqual(['左', '右'])
  })

  test('sorts vertical text right to left', () => {
    // 縦書き: 縦長の列が並ぶ。日本語の縦書きは右の列から読む。
    const items = [
      box('左の列', 10, 10, 30, 400),
      box('右の列', 200, 10, 30, 400),
      box('中の列', 100, 10, 30, 400),
    ]

    expect(orderOcrItems(items)).toEqual(['右の列', '中の列', '左の列'])
  })

  test('sorts items within the same vertical column top to bottom', () => {
    // 1 つの列が上下に分割検出された場合、その列の中では上→下。
    const items = [
      box('右列の下', 200, 300, 30, 200),
      box('左列', 10, 10, 30, 500),
      box('右列の上', 202, 10, 30, 250),
    ]

    expect(orderOcrItems(items)).toEqual(['右列の上', '右列の下', '左列'])
  })

  test('treats a mostly-vertical page as vertical writing', () => {
    // 縦書きページに横長の小さな断片 (ノンブル等) が 1 つ混じっても、
    // 多数派が縦長なら縦書きとして扱う。
    const items = [
      box('左の列', 10, 10, 30, 400),
      box('右の列', 200, 10, 30, 400),
      box('中の列', 100, 10, 30, 400),
      box('横の断片', 10, 450, 100, 20),
    ]

    expect(orderOcrItems(items)).toEqual([
      '右の列',
      '中の列',
      '左の列',
      '横の断片',
    ])
  })

  test('ignores items with an unusable poly', () => {
    const items: OcrItemLike[] = [
      box('生きている行', 10, 10, 200, 30),
      { text: '座標なし', poly: [] },
    ]

    expect(orderOcrItems(items)).toEqual(['生きている行'])
  })

  test('drops blank text', () => {
    const items = [box('本文', 10, 10, 200, 30), box('   ', 10, 60, 200, 30)]

    expect(orderOcrItems(items)).toEqual(['本文'])
  })
})
