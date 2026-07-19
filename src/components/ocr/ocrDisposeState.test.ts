import { describe, expect, test } from 'vitest'
import {
  INITIAL_OCR_DISPOSE_STATE,
  reduceOcrDispose,
  shouldDisposeNow,
  type OcrDisposeState,
} from './ocrDisposeState'

describe('reduceOcrDispose', () => {
  test('starts idle with no dispose requested', () => {
    expect(INITIAL_OCR_DISPOSE_STATE).toEqual({
      inFlight: 0,
      disposeRequested: false,
    })
  })

  test('counts overlapping OCR runs', () => {
    // Arrange / Act: 複数画像を続けて OCR できるので同時実行が起こる
    const one = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, { type: 'ocr-start' })
    const two = reduceOcrDispose(one, { type: 'ocr-start' })

    // Assert
    expect(two.inFlight).toBe(2)
  })

  test('does not count below zero when an end arrives without a start', () => {
    // Arrange / Act
    const state = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, { type: 'ocr-end' })

    // Assert: 負の値になると shouldDisposeNow が永久に false になる
    expect(state.inFlight).toBe(0)
  })

  test('does not mutate the given state', () => {
    // Arrange
    const state = INITIAL_OCR_DISPOSE_STATE

    // Act
    reduceOcrDispose(state, { type: 'ocr-start' })

    // Assert
    expect(state.inFlight).toBe(0)
  })

  test('clears the request once the dispose has run', () => {
    // Arrange
    const requested = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, {
      type: 'dispose-request',
    })

    // Act
    const state = reduceOcrDispose(requested, { type: 'dispose-run' })

    // Assert
    expect(state.disposeRequested).toBe(false)
  })
})

describe('shouldDisposeNow', () => {
  test('disposes immediately when nothing is running', () => {
    // Arrange
    const requested = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, {
      type: 'dispose-request',
    })

    // Act / Assert
    expect(shouldDisposeNow(requested)).toBe(true)
  })

  test('waits while an OCR is still running', () => {
    // Arrange: 認識中に ORT セッションを release すると挙動が保証されない
    const running = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, { type: 'ocr-start' })

    // Act
    const requested = reduceOcrDispose(running, { type: 'dispose-request' })

    // Assert
    expect(shouldDisposeNow(requested)).toBe(false)
  })

  test('disposes when the last running OCR finishes', () => {
    // Arrange
    const running = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, { type: 'ocr-start' })
    const requested = reduceOcrDispose(running, { type: 'dispose-request' })

    // Act
    const state = reduceOcrDispose(requested, { type: 'ocr-end' })

    // Assert
    expect(shouldDisposeNow(state)).toBe(true)
  })

  test('keeps waiting while another OCR is still running', () => {
    // Arrange: 2 本走っている状態で 1 本だけ終わっても解放してはいけない
    let state: OcrDisposeState = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, {
      type: 'ocr-start',
    })
    state = reduceOcrDispose(state, { type: 'ocr-start' })
    state = reduceOcrDispose(state, { type: 'dispose-request' })

    // Act
    state = reduceOcrDispose(state, { type: 'ocr-end' })

    // Assert
    expect(shouldDisposeNow(state)).toBe(false)
  })

  test('does not dispose while idle if nobody asked', () => {
    expect(shouldDisposeNow(INITIAL_OCR_DISPOSE_STATE)).toBe(false)
  })

  test('cancels a pending request when a new OCR starts', () => {
    // Arrange: OCR 中に画面を離れ (解放を持ち越し)、捌ける前に戻ってきた
    let state: OcrDisposeState = reduceOcrDispose(INITIAL_OCR_DISPOSE_STATE, {
      type: 'ocr-start',
    })
    state = reduceOcrDispose(state, { type: 'dispose-request' })

    // Act: 戻ってきたユーザーが次の OCR を始める
    state = reduceOcrDispose(state, { type: 'ocr-start' })
    state = reduceOcrDispose(state, { type: 'ocr-end' })
    state = reduceOcrDispose(state, { type: 'ocr-end' })

    // Assert: 使っている最中に解放してはいけない。離れるときに改めて頼まれる
    expect(shouldDisposeNow(state)).toBe(false)
  })
})
