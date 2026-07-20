import { describe, expect, test } from 'vitest'
import {
  canRedo,
  canUndo,
  createHistory,
  currentEntry,
  pushHistory,
  redoHistory,
  undoHistory,
} from './history'

describe('createHistory', () => {
  test('holds the initial entry with nothing to undo or redo', () => {
    // Arrange & Act
    const history = createHistory('a')

    // Assert
    expect(currentEntry(history)).toBe('a')
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })
})

describe('pushHistory', () => {
  test('appends an entry and makes it undoable', () => {
    // Arrange
    const history = createHistory('a')

    // Act
    const next = pushHistory(history, 'b')

    // Assert
    expect(currentEntry(next)).toBe('b')
    expect(canUndo(next)).toBe(true)
    expect(canRedo(next)).toBe(false)
  })

  test('returns the same history when the entry equals the current one', () => {
    // Arrange
    const history = pushHistory(createHistory('a'), 'b')

    // Act
    const next = pushHistory(history, 'b')

    // Assert
    expect(next).toBe(history)
  })

  test('does not mutate the given history', () => {
    // Arrange
    const history = createHistory('a')

    // Act
    pushHistory(history, 'b')

    // Assert
    expect(history.entries).toEqual(['a'])
    expect(history.index).toBe(0)
  })

  test('drops the redo tail when pushing after an undo', () => {
    // Arrange
    const history = undoHistory(pushHistory(pushHistory(createHistory('a'), 'b'), 'c'))

    // Act
    const next = pushHistory(history, 'd')

    // Assert
    expect(next.entries).toEqual(['a', 'b', 'd'])
    expect(canRedo(next)).toBe(false)
  })

  test('drops the oldest entry once the limit is reached', () => {
    // Arrange
    const history = pushHistory(createHistory('a'), 'b', 3)

    // Act
    const next = pushHistory(pushHistory(history, 'c', 3), 'd', 3)

    // Assert
    expect(next.entries).toEqual(['b', 'c', 'd'])
    expect(currentEntry(next)).toBe('d')
  })
})

describe('undoHistory', () => {
  test('moves back to the previous entry', () => {
    // Arrange
    const history = pushHistory(createHistory('a'), 'b')

    // Act
    const next = undoHistory(history)

    // Assert
    expect(currentEntry(next)).toBe('a')
    expect(canRedo(next)).toBe(true)
  })

  test('returns the same history at the oldest entry', () => {
    // Arrange
    const history = createHistory('a')

    // Act & Assert
    expect(undoHistory(history)).toBe(history)
  })
})

describe('redoHistory', () => {
  test('moves forward to the entry that was undone', () => {
    // Arrange
    const history = undoHistory(pushHistory(createHistory('a'), 'b'))

    // Act
    const next = redoHistory(history)

    // Assert
    expect(currentEntry(next)).toBe('b')
    expect(canRedo(next)).toBe(false)
  })

  test('returns the same history at the newest entry', () => {
    // Arrange
    const history = pushHistory(createHistory('a'), 'b')

    // Act & Assert
    expect(redoHistory(history)).toBe(history)
  })
})
