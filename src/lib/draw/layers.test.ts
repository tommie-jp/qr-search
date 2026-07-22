import { describe, expect, test } from 'vitest'
import {
  createLayerState,
  insertionIndex,
  isLayerHidden,
  LAYER_COUNT,
  LAYER_IDS,
  type LayerId,
  layerFlags,
  setActive,
  toggleHidden,
} from './layers'

describe('LAYER_IDS', () => {
  test('lists the three fixed layers from back to front', () => {
    // Arrange & Act & Assert
    expect(LAYER_IDS).toEqual([1, 2, 3])
    expect(LAYER_COUNT).toBe(3)
  })
})

describe('createLayerState', () => {
  test('starts on layer 1 with nothing hidden', () => {
    // Arrange & Act
    const state = createLayerState()

    // Assert
    expect(state.active).toBe(1)
    expect(state.hidden).toEqual([])
  })
})

describe('isLayerHidden', () => {
  test('reports a layer that is in the hidden set', () => {
    // Arrange
    const state = { active: 1 as LayerId, hidden: [2 as LayerId] }

    // Act & Assert
    expect(isLayerHidden(state, 2)).toBe(true)
    expect(isLayerHidden(state, 3)).toBe(false)
  })
})

describe('layerFlags', () => {
  test('makes the active layer both erasable and selectable under the select tool', () => {
    // Arrange
    const state = createLayerState()

    // Act
    const flags = layerFlags(1, state, true)

    // Assert
    expect(flags).toEqual({ visible: true, erasable: true, selectable: true })
  })

  test('keeps a non-active layer visible but out of reach of eraser and select', () => {
    // Arrange
    const state = createLayerState() // active 1

    // Act
    const flags = layerFlags(2, state, true)

    // Assert — 別レイヤは見えるが、消しゴム・選択は効かない
    expect(flags).toEqual({ visible: true, erasable: false, selectable: false })
  })

  test('never selects while a non-select tool is active', () => {
    // Arrange
    const state = createLayerState()

    // Act
    const flags = layerFlags(1, state, false)

    // Assert — アクティブレイヤでも選択道具でなければ掴めない
    expect(flags).toEqual({ visible: true, erasable: true, selectable: false })
  })

  test('hides a hidden layer and strips erasable and selectable with it', () => {
    // Arrange — レイヤ 2 を隠し、アクティブは 1
    const state = { active: 1 as LayerId, hidden: [2 as LayerId] }

    // Act
    const flags = layerFlags(2, state, true)

    // Assert — 見えないものは消せも選べもしない
    expect(flags).toEqual({ visible: false, erasable: false, selectable: false })
  })
})

describe('insertionIndex', () => {
  test('appends to the end of the target layer band', () => {
    // Arrange — z 順で [1,1,2,3] の帯
    const layers: LayerId[] = [1, 1, 2, 3]

    // Act & Assert
    expect(insertionIndex(layers, 1)).toBe(2) // レイヤ 1 の帯末尾 = 2 の帯直前
    expect(insertionIndex(layers, 2)).toBe(3)
    expect(insertionIndex(layers, 3)).toBe(4) // 最前面は列の末尾
  })

  test('returns 0 for an empty canvas', () => {
    // Arrange & Act & Assert
    expect(insertionIndex([], 2)).toBe(0)
  })

  test('places a new object above an empty target band', () => {
    // Arrange — レイヤ 2 に何も無く、下に 1、上に 3 がある
    const layers: LayerId[] = [1, 3]

    // Act & Assert — レイヤ 2 は 1 の直後 (= 3 の直前) に入る
    expect(insertionIndex(layers, 2)).toBe(1)
  })
})

describe('toggleHidden', () => {
  test('hides a visible non-active layer', () => {
    // Arrange
    const state = createLayerState() // active 1

    // Act
    const next = toggleHidden(state, 2)

    // Assert
    expect(next.hidden).toEqual([2])
  })

  test('shows a hidden layer again and keeps the set sorted', () => {
    // Arrange
    const state = { active: 1 as LayerId, hidden: [3 as LayerId, 2 as LayerId] }

    // Act
    const next = toggleHidden(state, 3)

    // Assert — 3 を戻すと 2 だけ残る
    expect(next.hidden).toEqual([2])
  })

  test('refuses to hide the active layer and returns the same state', () => {
    // Arrange
    const state = createLayerState() // active 1

    // Act
    const next = toggleHidden(state, 1)

    // Assert — 参照同一で「何も起きなかった」を伝える
    expect(next).toBe(state)
  })

  test('does not mutate the given state', () => {
    // Arrange
    const state = createLayerState()

    // Act
    toggleHidden(state, 2)

    // Assert
    expect(state.hidden).toEqual([])
  })
})

describe('setActive', () => {
  test('moves the active layer', () => {
    // Arrange
    const state = createLayerState()

    // Act
    const next = setActive(state, 3)

    // Assert
    expect(next.active).toBe(3)
  })

  test('reveals the newly active layer if it was hidden', () => {
    // Arrange — レイヤ 2 を隠した状態でそこをアクティブにする
    const state = { active: 1 as LayerId, hidden: [2 as LayerId] }

    // Act
    const next = setActive(state, 2)

    // Assert — アクティブは見えていなければならない (§2 のルール)
    expect(next.active).toBe(2)
    expect(next.hidden).toEqual([])
  })

  test('returns the same state when the layer is already active', () => {
    // Arrange
    const state = createLayerState()

    // Act & Assert
    expect(setActive(state, 1)).toBe(state)
  })
})
