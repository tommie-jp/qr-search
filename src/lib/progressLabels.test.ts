import { describe, expect, test } from 'vitest'
import { ocrButtonLabel, uploadButtonLabel } from './progressLabels'

describe('uploadButtonLabel', () => {
  test('shows the idle label when no upload is running', () => {
    expect(uploadButtonLabel(null)).toBe('画像を挿入')
  })

  test('shows percent only for a single file', () => {
    expect(uploadButtonLabel({ current: 1, total: 1, percent: 45 })).toBe(
      'アップロード中… 45%',
    )
  })

  test('shows m/n枚 and percent for a batch', () => {
    expect(uploadButtonLabel({ current: 2, total: 3, percent: 45 })).toBe(
      'アップロード中 2/3枚 45%',
    )
  })

  // 送信量を測れない環境では 0% 張り付きより % 無しの方がまし
  test('omits percent when it cannot be measured', () => {
    expect(uploadButtonLabel({ current: 1, total: 1, percent: null })).toBe(
      'アップロード中…',
    )
    expect(uploadButtonLabel({ current: 2, total: 3, percent: null })).toBe(
      'アップロード中 2/3枚',
    )
  })
})

describe('ocrButtonLabel', () => {
  test('shows the idle label when no OCR is running', () => {
    expect(ocrButtonLabel(0)).toBe('画像をOCR')
  })

  test('shows a plain busy label for a single task', () => {
    expect(ocrButtonLabel(1)).toBe('OCR処理中…')
  })

  test('shows the task count when tasks run concurrently', () => {
    expect(ocrButtonLabel(2)).toBe('OCR処理中 (2件)…')
  })
})
