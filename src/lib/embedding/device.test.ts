import { describe, expect, test } from 'vitest'
import { resolveDevice } from './device'

describe('resolveDevice', () => {
  test('returns undefined on Node so transformers.js picks onnxruntime-node', () => {
    // Arrange
    const ctx = { isNode: true, hasWebGpuAdapter: false, forceWasm: false }

    // Act
    const device = resolveDevice(ctx)

    // Assert
    expect(device).toBeUndefined()
  })

  test('returns undefined on Node even when WASM is forced (Node rejects wasm)', () => {
    expect(
      resolveDevice({ isNode: true, hasWebGpuAdapter: false, forceWasm: true }),
    ).toBeUndefined()
  })

  test('returns webgpu in the browser when an adapter is actually available', () => {
    expect(
      resolveDevice({ isNode: false, hasWebGpuAdapter: true, forceWasm: false }),
    ).toBe('webgpu')
  })

  test('returns wasm in the browser when no adapter is available', () => {
    expect(
      resolveDevice({ isNode: false, hasWebGpuAdapter: false, forceWasm: false }),
    ).toBe('wasm')
  })

  test('returns wasm on a forced retry even when an adapter is available', () => {
    // WebGPU の初期化が落ちた端末 (iPhone の OOM) を WASM で救う経路
    expect(
      resolveDevice({ isNode: false, hasWebGpuAdapter: true, forceWasm: true }),
    ).toBe('wasm')
  })
})
