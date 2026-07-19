import { describe, expect, test } from 'vitest'
import { formatDiagEvent, readMemorySnapshot } from './diagLog'

describe('readMemorySnapshot', () => {
  test('reads Chrome performance.memory when present', () => {
    // Arrange: Blink 系だけが持つ非標準 API
    const perf = {
      memory: {
        usedJSHeapSize: 123 * 1024 * 1024,
        jsHeapSizeLimit: 4096 * 1024 * 1024,
      },
    }

    // Act
    const snapshot = readMemorySnapshot(perf)

    // Assert
    expect(snapshot).toEqual({ usedMB: 123, limitMB: 4096 })
  })

  test('returns null on WebKit (iPhone) where the API does not exist', () => {
    // Arrange: iOS は全ブラウザが WebKit で performance.memory を持たない
    const perf = {}

    // Act / Assert
    expect(readMemorySnapshot(perf)).toBeNull()
  })

  test('returns null when performance itself is missing', () => {
    expect(readMemorySnapshot(undefined)).toBeNull()
  })

  test('returns null when the fields are not numbers', () => {
    // Arrange: 外から来た形は信じない
    const perf = { memory: { usedJSHeapSize: 'a', jsHeapSizeLimit: null } }

    // Act / Assert
    expect(readMemorySnapshot(perf)).toBeNull()
  })
})

describe('formatDiagEvent', () => {
  test('appends the heap summary when a snapshot is available', () => {
    // Arrange / Act
    const text = formatDiagEvent('[OCR] Worker 起動', {
      usedMB: 123,
      limitMB: 4096,
    })

    // Assert
    expect(text).toBe('[OCR] Worker 起動 [JSヒープ 123/4096MB]')
  })

  test('returns the event alone when no snapshot is available (iPhone)', () => {
    // Arrange / Act
    const text = formatDiagEvent('[OCR] Worker 起動', null)

    // Assert: iPhone では数値が取れないので、イベントと時刻だけで診断する
    expect(text).toBe('[OCR] Worker 起動')
  })
})
