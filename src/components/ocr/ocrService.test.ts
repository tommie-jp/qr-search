// ocrService (メインスレッド側の窓口) のテスト (docs/24-画像OCR計画.md §9-1)。
//
// 見たいのは Worker との配線: 要求と応答の対応づけ、進捗の中継、そして
// **terminate でメモリを返す**こと。ここが壊れてもメモリが減らないだけで
// 画面上は何も変わらず、実機 (iPhone) を出すまで気づけないため押さえておく。
//
// Worker は jsdom に無いので差し替える。OCR の中身 (SDK・モデル) は
// ocrWorker.ts 側なので、ここでは一切読み込まない。

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { FromOcrWorker, ToOcrWorker } from './ocrWorkerMessages'

// 生成された偽 Worker を順に記録する (terminate 後の作り直しを見るため)
const workers: FakeWorker[] = []

class FakeWorker {
  postMessage = vi.fn<(message: ToOcrWorker) => void>()
  terminate = vi.fn()
  onmessage: ((event: MessageEvent<FromOcrWorker>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  constructor() {
    workers.push(this)
  }

  // Worker からの応答を流す
  emit(message: FromOcrWorker): void {
    this.onmessage?.({ data: message } as MessageEvent<FromOcrWorker>)
  }

  // 受け取った要求のうち最後の 1 件
  lastRequest(): ToOcrWorker {
    return this.postMessage.mock.calls.at(-1)![0]
  }
}

vi.stubGlobal('Worker', FakeWorker)

// モジュールの singleton をテスト間で持ち越さないよう毎回読み込み直す
async function loadService() {
  vi.resetModules()
  workers.length = 0
  return import('./ocrService')
}

beforeEach(() => {
  workers.length = 0
})

// terminate で落とされる要求を受け取っておくヘルパ。放っておくと未処理の
// rejection になり、本物の失敗が埋もれる
function expectRejection(promise: Promise<unknown>): Promise<unknown> {
  return expect(promise).rejects.toThrow()
}

describe('ocrImageToQuote', () => {
  test('resolves with the quote the worker sends back', async () => {
    // Arrange
    const ocr = await loadService()
    const quote = ocr.ocrImageToQuote(new Blob())
    const request = workers[0].lastRequest()

    // Act
    if (request.type !== 'ocr') {
      throw new Error('OCR 要求が送られていない')
    }
    workers[0].emit({ type: 'result', id: request.id, quote: '> あいう' })

    // Assert
    await expect(quote).resolves.toBe('> あいう')
  })

  test('keeps concurrent requests apart by id', async () => {
    // Arrange: 複数画像を続けて OCR できるので同時実行が起こる
    const ocr = await loadService()
    const first = ocr.ocrImageToQuote(new Blob())
    const second = ocr.ocrImageToQuote(new Blob())
    const ids = workers[0].postMessage.mock.calls
      .map(([m]) => m)
      .filter((m) => m.type === 'ocr')
      .map((m) => m.id)

    // Act: 2 本目を先に返す
    workers[0].emit({ type: 'result', id: ids[1], quote: '2 本目' })
    workers[0].emit({ type: 'result', id: ids[0], quote: '1 本目' })

    // Assert
    await expect(first).resolves.toBe('1 本目')
    await expect(second).resolves.toBe('2 本目')
  })

  test('reuses one worker for later requests', async () => {
    // Arrange
    const ocr = await loadService()

    // Act
    ocr.ocrImageToQuote(new Blob())
    ocr.ocrImageToQuote(new Blob())

    // Assert: 要求のたびに起こし直すとモデルを毎回読み直すことになる
    expect(workers).toHaveLength(1)
  })

  test('rejects when the worker reports a failure', async () => {
    // Arrange
    const ocr = await loadService()
    const quote = ocr.ocrImageToQuote(new Blob())
    const request = workers[0].lastRequest()

    // Act
    if (request.type !== 'ocr') {
      throw new Error('OCR 要求が送られていない')
    }
    workers[0].emit({ type: 'error', id: request.id, message: '読めません' })

    // Assert
    await expect(quote).rejects.toThrow('読めません')
  })

  test('rejects when the worker itself fails to start', async () => {
    // Arrange: チャンクの 404 などで onmessage が一生来ない場合
    const ocr = await loadService()
    const quote = ocr.ocrImageToQuote(new Blob())

    // Act
    workers[0].onerror?.({ message: 'Importing a module script failed.' } as ErrorEvent)

    // Assert: 拾わないと呼び手が永遠に待つ
    await expect(quote).rejects.toThrow('Importing a module script failed.')
  })
})

describe('disposeOcr', () => {
  test('terminates the worker so the wasm heap goes back to the OS', async () => {
    // Arrange
    const ocr = await loadService()
    const abandoned = expectRejection(ocr.ocrImageToQuote(new Blob()))

    // Act
    ocr.disposeOcr()

    // Assert: dispose() ではヒープが縮まないので terminate でなければ意味がない
    expect(workers[0].terminate).toHaveBeenCalledTimes(1)
    await abandoned
  })

  test('starts a fresh worker for the next OCR', async () => {
    // Arrange
    const ocr = await loadService()
    const abandoned = expectRejection(ocr.ocrImageToQuote(new Blob()))
    ocr.disposeOcr()

    // Act
    ocr.ocrImageToQuote(new Blob())

    // Assert
    expect(workers).toHaveLength(2)
    expect(workers[1].terminate).not.toHaveBeenCalled()
    await abandoned
  })

  test('does nothing when no worker was ever started', async () => {
    // Arrange: OCR を 1 度も使わずに編集画面を離れた場合
    const ocr = await loadService()

    // Act
    ocr.disposeOcr()

    // Assert
    expect(workers).toHaveLength(0)
  })

  test('rejects in-flight requests instead of leaving them hanging', async () => {
    // Arrange
    const ocr = await loadService()
    const quote = ocr.ocrImageToQuote(new Blob())

    // Act
    ocr.disposeOcr()

    // Assert
    await expect(quote).rejects.toThrow('OCR を終了しました')
  })

  test('forgets that the model was ready', async () => {
    // Arrange
    const ocr = await loadService()
    const abandoned = expectRejection(ocr.ocrImageToQuote(new Blob()))
    workers[0].emit({ type: 'ready' })
    expect(ocr.isOcrReady()).toBe(true)

    // Act
    ocr.disposeOcr()

    // Assert: 次は読み直しになるので UI は「準備中」を出さないといけない
    expect(ocr.isOcrReady()).toBe(false)
    await abandoned
  })
})

describe('subscribeModelProgress', () => {
  test('relays download percentages from the worker', async () => {
    // Arrange
    const ocr = await loadService()
    const seen: number[] = []
    ocr.subscribeModelProgress((p) => seen.push(p))
    ocr.ocrImageToQuote(new Blob())

    // Act
    workers[0].emit({ type: 'model-progress', percent: 40 })
    workers[0].emit({ type: 'model-progress', percent: 70 })

    // Assert
    expect(seen).toEqual([40, 70])
  })

  test('does not repeat the same percentage', async () => {
    // Arrange: チャンク到着ごとに同じ整数を流すと購読者が無駄に再描画される
    const ocr = await loadService()
    const seen: number[] = []
    ocr.subscribeModelProgress((p) => seen.push(p))
    ocr.ocrImageToQuote(new Blob())

    // Act
    workers[0].emit({ type: 'model-progress', percent: 40 })
    workers[0].emit({ type: 'model-progress', percent: 40 })

    // Assert
    expect(seen).toEqual([40])
  })

  test('reports completion so the banner folds away', async () => {
    // Arrange
    const ocr = await loadService()
    const seen: number[] = []
    ocr.subscribeModelProgress((p) => seen.push(p))
    ocr.ocrImageToQuote(new Blob())

    // Act
    workers[0].emit({ type: 'ready' })

    // Assert
    expect(seen).toEqual([ocr.MODEL_READY_PERCENT])
  })

  test('folds the banner away when the model cannot be loaded', async () => {
    // Arrange: 伝えないと「準備しています… 47%」が永久に残る
    // (バイト計は 99 止まりで完了に届かないため)
    const ocr = await loadService()
    const seen: number[] = []
    ocr.subscribeModelProgress((p) => seen.push(p))
    const quote = ocr.ocrImageToQuote(new Blob())

    // Act
    workers[0].emit({ type: 'load-error', message: 'Out of memory' })

    // Assert
    expect(seen).toEqual([ocr.MODEL_READY_PERCENT])
    await expect(quote).rejects.toThrow('Out of memory')
  })

  test('stops relaying after unsubscribe', async () => {
    // Arrange
    const ocr = await loadService()
    const seen: number[] = []
    const unsubscribe = ocr.subscribeModelProgress((p) => seen.push(p))
    ocr.ocrImageToQuote(new Blob())

    // Act
    unsubscribe()
    workers[0].emit({ type: 'model-progress', percent: 40 })

    // Assert
    expect(seen).toEqual([])
  })
})
