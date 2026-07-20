import { describe, expect, test } from 'vitest'
import { hexToRgb, MARKER_ALPHA, markerColor, withAlpha } from './drawColor'

describe('hexToRgb', () => {
  test('splits a hex triplet into channels', () => {
    // Arrange & Act & Assert
    expect(hexToRgb('#ff3b30')).toEqual([255, 59, 48])
  })

  test('falls back to black when the colour is not a hex triplet', () => {
    // Arrange & Act & Assert
    expect(hexToRgb('rgb(1,2,3)')).toEqual([0, 0, 0])
  })
})

describe('withAlpha', () => {
  test('turns a hex triplet into rgba', () => {
    // Arrange & Act & Assert
    expect(withAlpha('#ff3b30', 0.35)).toBe('rgba(255, 59, 48, 0.35)')
  })

  test('reads uppercase hex', () => {
    // Arrange & Act & Assert
    expect(withAlpha('#00AAFF', 0.5)).toBe('rgba(0, 170, 255, 0.5)')
  })

  test('handles black and white', () => {
    // Arrange & Act & Assert
    expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)')
    expect(withAlpha('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)')
  })

  test('falls back to opaque black when the colour is not a hex triplet', () => {
    // Arrange & Act & Assert — 設定の検算は drawPrefs が持つが、ここでも
    // 壊れた値でキャンバスを壊さない
    expect(withAlpha('red', 0.35)).toBe('rgba(0, 0, 0, 0.35)')
  })

  test('clamps the alpha into 0..1', () => {
    // Arrange & Act & Assert
    expect(withAlpha('#ff3b30', 2)).toBe('rgba(255, 59, 48, 1)')
    expect(withAlpha('#ff3b30', -1)).toBe('rgba(255, 59, 48, 0)')
  })
})

describe('markerColor', () => {
  test('applies the shared marker alpha to the picked colour', () => {
    // Arrange & Act & Assert
    expect(markerColor('#ff3b30')).toBe(withAlpha('#ff3b30', MARKER_ALPHA))
  })

  test('stays translucent so what is underneath shows through', () => {
    // Arrange & Act & Assert
    expect(MARKER_ALPHA).toBeGreaterThan(0)
    expect(MARKER_ALPHA).toBeLessThan(1)
  })
})
