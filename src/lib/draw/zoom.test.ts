import { describe, expect, test } from 'vitest'
import {
  clampPan,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  panForPinch,
  panForZoom,
  pinchCenter,
  pinchSpan,
} from './zoom'

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

  test('clamps infinities to the range instead of resetting to 1', () => {
    // Arrange & Act & Assert — Infinity を「既定へ逃がす」と、上限・下限の
    // つもりで渡した呼び手が 1 を受け取り、+ ボタンが常に無効になる
    // (実際に起きた不具合)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM)
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(MIN_ZOOM)
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

describe('panForZoom', () => {
  test('keeps the pinched point still while zooming in', () => {
    // Arrange — 中身の (200, 100) を見ている状態で、その点をつまんで 2 倍にする
    const next = panForZoom({
      pan: { left: 100, top: 50 },
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
    const next = panForZoom({
      pan: { left: 300, top: 150 },
      pointer: { x: 100, y: 50 },
      from: 2,
      to: 1,
    })

    // Assert — 拡大の逆をたどって元へ戻る
    expect(next).toEqual({ left: 100, top: 50 })
  })

  test('never pans to a negative offset', () => {
    // Arrange & Act — 左上の隅で縮めると計算上は負になる
    const next = panForZoom({
      pan: { left: 0, top: 0 },
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
    const next = panForZoom({
      pan: { left: 40, top: 20 },
      pointer: { x: 10, y: 10 },
      from: 1.5,
      to: 1.5,
    })

    // Assert
    expect(next).toEqual({ left: 40, top: 20 })
  })
})

describe('panForPinch', () => {
  test('pans by the centre movement when the zoom does not change', () => {
    // Arrange & Act — 2 本指を開かず、右下へ 30,20 だけ平行移動した
    const next = panForPinch({
      pan: { left: 100, top: 50 },
      from: 2,
      startCenter: { x: 100, y: 100 },
      currentCenter: { x: 130, y: 120 },
      to: 2,
    })

    // Assert — 中身が指に付いてくる = 送りは指の移動ぶん減る
    expect(next).toEqual({ left: 70, top: 30 })
  })

  test('matches panForZoom when the centre stays still', () => {
    // Arrange
    const input = {
      pan: { left: 100, top: 50 },
      from: 1,
      to: 2,
    }
    const center = { x: 100, y: 50 }

    // Act & Assert
    expect(
      panForPinch({ ...input, startCenter: center, currentCenter: center }),
    ).toEqual(panForZoom({ ...input, pointer: center }))
  })

  test('zooms and pans in one motion', () => {
    // Arrange & Act — つまんだ点 (中身の 200,100) を 2 倍にしつつ右へ 10 運ぶ
    const next = panForPinch({
      pan: { left: 100, top: 50 },
      from: 1,
      startCenter: { x: 100, y: 50 },
      currentCenter: { x: 110, y: 50 },
      to: 2,
    })

    // Assert — 2 倍後の位置 400 から今の中心 110 を引く
    expect(next).toEqual({ left: 290, top: 150 })
  })

  test('never returns a negative offset', () => {
    // Arrange & Act
    const next = panForPinch({
      pan: { left: 0, top: 0 },
      from: 1,
      startCenter: { x: 0, y: 0 },
      currentCenter: { x: 50, y: 50 },
      to: 1,
    })

    // Assert
    expect(next).toEqual({ left: 0, top: 0 })
  })
})

describe('clampPan', () => {
  test('does not pan past the right or bottom edge of the content', () => {
    // Arrange & Act — 中身 1000 を枠 400 で見ているので、送れるのは 600 まで
    const next = clampPan(
      { left: 900, top: 900 },
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
    )

    // Assert
    expect(next).toEqual({ left: 600, top: 600 })
  })

  test('does not pan at all while the content fits in the view', () => {
    // Arrange & Act
    const next = clampPan(
      { left: 120, top: 80 },
      { width: 300, height: 200 },
      { width: 400, height: 400 },
    )

    // Assert — 収まっているなら中央のまま動かさない
    expect(next).toEqual({ left: 0, top: 0 })
  })

  test('keeps a pan that is already inside the range', () => {
    // Arrange & Act
    const next = clampPan(
      { left: 100, top: 50 },
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
    )

    // Assert
    expect(next).toEqual({ left: 100, top: 50 })
  })

  test('never returns a negative offset', () => {
    // Arrange & Act
    const next = clampPan(
      { left: -50, top: -50 },
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
    )

    // Assert
    expect(next).toEqual({ left: 0, top: 0 })
  })
})
