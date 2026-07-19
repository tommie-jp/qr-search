import { describe, expect, test } from 'vitest'
import {
  INITIAL_EMBEDDER_LOAD_STATE,
  needsWasmRespawn,
  reduceEmbedderLoad,
  shouldStartWithWasm,
  type EmbedderLoadState,
} from './embedderLoadState'

const WEBGPU_OOM = 'Error: no available backend found. ERR: [webgpu] Out of memory'

describe('reduceEmbedderLoad', () => {
  test('starts in loading with no failure message', () => {
    expect(INITIAL_EMBEDDER_LOAD_STATE).toEqual({
      phase: 'loading',
      failureMessage: null,
    })
  })

  test('becomes ready when the first load succeeds', () => {
    // Arrange / Act
    const state = reduceEmbedderLoad(INITIAL_EMBEDDER_LOAD_STATE, { type: 'ready' })

    // Assert
    expect(state.phase).toBe('ready')
    expect(state.failureMessage).toBeNull()
  })

  test('retries with WASM instead of failing when the first load fails', () => {
    // Arrange / Act
    const state = reduceEmbedderLoad(INITIAL_EMBEDDER_LOAD_STATE, {
      type: 'load-failure',
      message: WEBGPU_OOM,
    })

    // Assert: UI にはまだ失敗を見せない (WASM で救える見込みがある)
    expect(state.phase).toBe('retrying-wasm')
    expect(state.failureMessage).toBeNull()
  })

  test('becomes ready when the WASM retry succeeds', () => {
    // Arrange
    const retrying = reduceEmbedderLoad(INITIAL_EMBEDDER_LOAD_STATE, {
      type: 'load-failure',
      message: WEBGPU_OOM,
    })

    // Act
    const state = reduceEmbedderLoad(retrying, { type: 'ready' })

    // Assert
    expect(state.phase).toBe('ready')
    expect(state.failureMessage).toBeNull()
  })

  test('fails with the retry reason when the WASM retry also fails', () => {
    // Arrange
    const retrying = reduceEmbedderLoad(INITIAL_EMBEDDER_LOAD_STATE, {
      type: 'load-failure',
      message: WEBGPU_OOM,
    })

    // Act
    const state = reduceEmbedderLoad(retrying, {
      type: 'load-failure',
      message: 'Error: [wasm] Out of memory',
    })

    // Assert: 2 回目の理由を出す (WASM でも駄目だった事実が原因究明に要る)
    expect(state.phase).toBe('failed')
    expect(state.failureMessage).toBe('Error: [wasm] Out of memory')
  })

  test('does not retry more than once', () => {
    // Arrange
    const failed: EmbedderLoadState = { phase: 'failed', failureMessage: 'boom' }

    // Act
    const state = reduceEmbedderLoad(failed, { type: 'load-failure', message: 'again' })

    // Assert
    expect(state.phase).toBe('failed')
  })

  test('keeps a ready embedder ready when a later frame fails', () => {
    // Arrange: 読み込み済みなら 1 枚の失敗は壊れたフレームであってモデル不調ではない
    const ready = reduceEmbedderLoad(INITIAL_EMBEDDER_LOAD_STATE, { type: 'ready' })

    // Act
    const state = reduceEmbedderLoad(ready, { type: 'load-failure', message: 'bad frame' })

    // Assert
    expect(state.phase).toBe('ready')
    expect(state.failureMessage).toBeNull()
  })
})

describe('needsWasmRespawn', () => {
  test('asks for a fresh WASM worker exactly when the retry begins', () => {
    // Arrange
    const retrying = reduceEmbedderLoad(INITIAL_EMBEDDER_LOAD_STATE, {
      type: 'load-failure',
      message: WEBGPU_OOM,
    })

    // Act / Assert
    expect(needsWasmRespawn(INITIAL_EMBEDDER_LOAD_STATE, retrying)).toBe(true)
  })

  test('does not ask again while the retry is still loading', () => {
    const retrying: EmbedderLoadState = { phase: 'retrying-wasm', failureMessage: null }
    expect(needsWasmRespawn(retrying, retrying)).toBe(false)
  })

  test('does not ask when the first load succeeds', () => {
    const ready = reduceEmbedderLoad(INITIAL_EMBEDDER_LOAD_STATE, { type: 'ready' })
    expect(needsWasmRespawn(INITIAL_EMBEDDER_LOAD_STATE, ready)).toBe(false)
  })
})

describe('shouldStartWithWasm', () => {
  test('starts with WASM on a heap-constrained device', () => {
    // Arrange: 実測した constrained な Windows Chrome (上限 1120MB)。
    // WebGPU の試行自体が OOM の引き金になる
    const snapshot = { limitMB: 1120 }

    // Act / Assert
    expect(shouldStartWithWasm(snapshot)).toBe(true)
  })

  test('tries WebGPU first on a normal desktop', () => {
    // Arrange: 通常の x64 Chrome (上限 ~4GB)
    const snapshot = { limitMB: 4192 }

    // Act / Assert
    expect(shouldStartWithWasm(snapshot)).toBe(false)
  })

  test('tries WebGPU first when the heap limit is unknown (iPhone)', () => {
    // Arrange: WebKit は performance.memory を持たない。iPhone の WebGPU は
    // 正常に動くので、数値が無いだけで WASM に倒してはいけない
    expect(shouldStartWithWasm(null)).toBe(false)
  })
})
