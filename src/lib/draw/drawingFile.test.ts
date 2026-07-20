import { describe, expect, test } from 'vitest'
import {
  blankCanvasSize,
  canvasSizeForImage,
  drawingAltText,
  drawingFileName,
  MAX_DRAWING_EDGE,
} from './drawingFile'

// 端末のタイムゾーンに依らないよう、日付はローカル時刻の要素から組み立てる
const AT = new Date(2026, 6, 20, 12, 34, 56)

describe('drawingFileName', () => {
  test('builds a sortable name from the local date and the extension', () => {
    // Arrange & Act
    const name = drawingFileName(AT, 'webp')

    // Assert
    expect(name).toBe('drawing-20260720-123456.webp')
  })

  test('zero-pads single digit parts', () => {
    // Arrange & Act
    const name = drawingFileName(new Date(2026, 0, 2, 3, 4, 5), 'png')

    // Assert
    expect(name).toBe('drawing-20260102-030405.png')
  })
})

describe('drawingAltText', () => {
  test('describes the drawing with its date so full text search can find it', () => {
    // Arrange & Act
    const alt = drawingAltText(AT)

    // Assert
    expect(alt).toBe('お絵かき 2026-07-20 12:34')
  })

  test('contains no character that would break the image syntax', () => {
    // Arrange & Act
    const alt = drawingAltText(AT)

    // Assert — `]` `|` と改行は ![alt](url) の記法や幅指定を壊す
    expect(alt).not.toMatch(/[[\]|\r\n]/)
  })
})

describe('canvasSizeForImage', () => {
  test('keeps a small image at its natural size', () => {
    // Arrange & Act
    const size = canvasSizeForImage(800, 600)

    // Assert
    expect(size).toEqual({ width: 800, height: 600 })
  })

  test('shrinks a wide image so the long edge meets the limit', () => {
    // Arrange & Act
    const size = canvasSizeForImage(4800, 2400, 2400)

    // Assert
    expect(size).toEqual({ width: 2400, height: 1200 })
  })

  test('shrinks a tall image so the long edge meets the limit', () => {
    // Arrange & Act
    const size = canvasSizeForImage(1200, 3600, 2400)

    // Assert
    expect(size).toEqual({ width: 800, height: 2400 })
  })

  test('rounds to whole pixels and never returns zero', () => {
    // Arrange & Act
    const size = canvasSizeForImage(10000, 3, 2400)

    // Assert
    expect(size.width).toBe(2400)
    expect(size.height).toBe(1)
  })

  test('falls back to the default limit', () => {
    // Arrange & Act
    const size = canvasSizeForImage(MAX_DRAWING_EDGE * 2, MAX_DRAWING_EDGE * 2)

    // Assert
    expect(size).toEqual({ width: MAX_DRAWING_EDGE, height: MAX_DRAWING_EDGE })
  })

  test('falls back to a usable size when the image reports no dimensions', () => {
    // Arrange & Act
    const size = canvasSizeForImage(0, 0)

    // Assert — 復号に失敗した画像でも描ける器は返す
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
  })
})

describe('blankCanvasSize', () => {
  test('scales the available area up so the long edge is usable', () => {
    // Arrange & Act
    const size = blankCanvasSize(600, 400)

    // Assert — 表示は CSS で縮めるので、論理サイズは解像度として十分に取る
    expect(size).toEqual({ width: 1600, height: 1067 })
  })

  test('keeps a portrait area portrait', () => {
    // Arrange & Act
    const size = blankCanvasSize(360, 640)

    // Assert
    expect(size.height).toBeGreaterThan(size.width)
    expect(size.height).toBe(1600)
  })

  test('falls back to a landscape default when the area has not been measured', () => {
    // Arrange & Act
    const size = blankCanvasSize(0, 0)

    // Assert
    expect(size).toEqual({ width: 1600, height: 1200 })
  })
})
