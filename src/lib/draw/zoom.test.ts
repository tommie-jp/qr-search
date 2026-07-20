import { describe, expect, test } from 'vitest'
import { clampZoom, MAX_ZOOM, MIN_ZOOM, pinchCenter, pinchSpan, scrollForZoom } from './zoom'

describe('clampZoom', () => {
  test('keeps a zoom inside the allowed range as is', () => {
    // Arrange & Act & Assert
    expect(clampZoom(2)).toBe(2)
  })

  test('does not zoom out past the whole canvas', () => {
    // Arrange & Act & Assert
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
  })

  test('does not zoom in past the limit', () => {
    // Arrange & Act & Assert — 伸ばしすぎてもぼけるだけ
    expect(clampZoom(99)).toBe(MAX_ZOOM)
  })

  test('falls back to 1 when the value is not a number', () => {
    // Arrange & Act & Assert — 0 除算で NaN が来ても画面を壊さない
    expect(clampZoom(Number.NaN)).toBe(1)
  })
})

describe('pinchSpan', () => {
  test('measures the distance between two touches', () => {
    // Arrange & Act & Assert
    expect(pinchSpan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('pinchCenter', () => {
  test('takes the midpoint of the two touches', () => {
    // Arrange & Act & Assert
    expect(pinchCenter({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 })
  })
})

describe('scrollForZoom', () => {
  test('keeps the pinched point still while zooming in', () => {
    // Arrange — 中身の (200, 100) を見ている状態で、その点をつまんで 2 倍にする
    const next = scrollForZoom({
      scroll: { left: 100, top: 50 },
      // 枠の中での指の位置 (枠の左上から測った値)
      pointer: { x: 100, y: 50 },
      from: 1,
      to: 2,
    })

    // Assert — 中身の座標は (100+100)/1 = 200。2 倍では 400 に来るので、
    // 指の位置に留めるにはスクロールを 400-100 = 300 にする
    expect(next).toEqual({ left: 300, top: 150 })
  })

  test('keeps the pinched point still while zooming out', () => {
    // Arrange & Act
    const next = scrollForZoom({
      scroll: { left: 300, top: 150 },
      pointer: { x: 100, y: 50 },
      from: 2,
      to: 1,
    })

    // Assert — 拡大の逆をたどって元へ戻る
    expect(next).toEqual({ left: 100, top: 50 })
  })

  test('never scrolls to a negative offset', () => {
    // Arrange & Act — 左上の隅で縮めると計算上は負になる
    const next = scrollForZoom({
      scroll: { left: 0, top: 0 },
      pointer: { x: 10, y: 10 },
      from: 2,
      to: 1,
    })

    // Assert
    expect(next.left).toBeGreaterThanOrEqual(0)
    expect(next.top).toBeGreaterThanOrEqual(0)
  })

  test('does not move when the zoom has not changed', () => {
    // Arrange & Act
    const next = scrollForZoom({
      scroll: { left: 40, top: 20 },
      pointer: { x: 10, y: 10 },
      from: 1.5,
      to: 1.5,
    })

    // Assert
    expect(next).toEqual({ left: 40, top: 20 })
  })
})
