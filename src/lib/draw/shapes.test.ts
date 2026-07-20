import { describe, expect, test } from 'vitest'
import {
  arrowGeometry,
  arrowPathData,
  dragDistance,
  normalizeDragRect,
  strokeCenteredRect,
} from './shapes'

describe('normalizeDragRect', () => {
  test('keeps a rect dragged right-down as is', () => {
    // Arrange & Act
    const rect = normalizeDragRect({ x: 10, y: 20 }, { x: 110, y: 70 })

    // Assert
    expect(rect).toEqual({ left: 10, top: 20, width: 100, height: 50 })
  })

  test('flips a rect dragged left-up so width and height stay positive', () => {
    // Arrange & Act
    const rect = normalizeDragRect({ x: 110, y: 70 }, { x: 10, y: 20 })

    // Assert
    expect(rect).toEqual({ left: 10, top: 20, width: 100, height: 50 })
  })

  test('flips only the axis that runs backwards', () => {
    // Arrange & Act
    const rect = normalizeDragRect({ x: 110, y: 20 }, { x: 10, y: 70 })

    // Assert
    expect(rect).toEqual({ left: 10, top: 20, width: 100, height: 50 })
  })

  test('returns a zero sized rect when the drag has not moved', () => {
    // Arrange & Act
    const rect = normalizeDragRect({ x: 10, y: 20 }, { x: 10, y: 20 })

    // Assert
    expect(rect).toEqual({ left: 10, top: 20, width: 0, height: 0 })
  })
})

describe('dragDistance', () => {
  test('measures the straight line length of the drag', () => {
    // Arrange & Act & Assert
    expect(dragDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  test('is zero when the pointer has not moved', () => {
    // Arrange & Act & Assert
    expect(dragDistance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0)
  })
})

describe('strokeCenteredRect', () => {
  test('pulls the top-left corner back by half the stroke', () => {
    // Arrange & Act
    const rect = strokeCenteredRect({ left: 100, top: 50, width: 200, height: 80 }, 24)

    // Assert — 見た目の箱が [88, 38]〜[324, 154] となり、線の中心が
    // ドラッグした [100, 50]〜[300, 130] にちょうど乗る
    expect(rect).toEqual({ left: 88, top: 38, width: 200, height: 80 })
  })

  test('leaves the rect untouched when there is no stroke', () => {
    // Arrange
    const dragged = { left: 100, top: 50, width: 200, height: 80 }

    // Act & Assert
    expect(strokeCenteredRect(dragged, 0)).toEqual(dragged)
  })
})

describe('arrowGeometry', () => {
  test('puts both barbs behind the tip, symmetric about the shaft', () => {
    // Arrange & Act
    const { barbs } = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 5)

    // Assert — 水平の矢なので、鏃は同じ x でぶら下がり y が対称になる
    expect(barbs[0].x).toBeCloseTo(barbs[1].x)
    expect(barbs[0].x).toBeLessThan(100)
    expect(barbs[0].y).toBeCloseTo(-barbs[1].y)
    expect(barbs[0].y).not.toBeCloseTo(0)
  })

  test('scales the head with the stroke width', () => {
    // Arrange
    const from = { x: 0, y: 0 }
    const to = { x: 1000, y: 0 }

    // Act
    const thin = arrowGeometry(from, to, 2)
    const thick = arrowGeometry(from, to, 8)

    // Assert — 太い線ほど鏃も大きい (= 先端から遠い所から生える)
    expect(thick.barbs[0].x).toBeLessThan(thin.barbs[0].x)
  })

  test('caps the head so a short arrow is not all head', () => {
    // Arrange & Act — 太さ 20 の既定の鏃 (80) は軸 (50) より長い
    const { barbs } = arrowGeometry({ x: 0, y: 0 }, { x: 50, y: 0 }, 20)

    // Assert — 鏃が始点を追い越さない (軸が残る)
    expect(barbs[0].x).toBeGreaterThan(0)
  })

  test('follows the drag direction', () => {
    // Arrange & Act — 真下向きの矢
    const { barbs } = arrowGeometry({ x: 0, y: 0 }, { x: 0, y: 100 }, 5)

    // Assert — 鏃は先端より上 (手前) にあり、x が対称に開く
    expect(barbs[0].y).toBeLessThan(100)
    expect(barbs[0].x).toBeCloseTo(-barbs[1].x)
  })
})

describe('arrowPathData', () => {
  test('draws the shaft then lifts the pen to draw the head', () => {
    // Arrange
    const geometry = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 5)

    // Act
    const data = arrowPathData(geometry)

    // Assert — 軸を引いてから M で筆を上げ、鏃を先端で折り返す 1 本の Path
    expect(data).toMatch(/^M 0 0 L 100 0 M /)
    expect(data.match(/M /g)).toHaveLength(2)
    expect(data.match(/L /g)).toHaveLength(3)
  })

  test('rounds coordinates so the path data stays short', () => {
    // Arrange
    const geometry = arrowGeometry({ x: 0, y: 0 }, { x: 77, y: 31 }, 3)

    // Act
    const data = arrowPathData(geometry)

    // Assert — 小数は 2 桁まで (履歴 JSON に何度も載るので長さを抑える)
    for (const value of data.match(/-?\d+\.\d+/g) ?? []) {
      expect(value.split('.')[1].length).toBeLessThanOrEqual(2)
    }
  })
})
