// ocrService の**解放の配線**だけを見るテスト (docs/24-画像OCR計画.md §9-1)。
//
// 判断そのものは ocrDisposeState の純関数が持つのでそちらで見る。ここで見たいのは
// 副作用の側: singleton を捨てたか・SDK の dispose を呼んだか・認識中は待つか。
// ここが壊れるとメモリが解放されないだけで画面上は何も変わらず、実機
// (iPhone) を出すまで気づけないため、テストで押さえておく。
//
// SDK・OpenCV・モデルは重すぎるので丸ごと差し替える。ocrImageToQuote が使う
// ブラウザ API (createImageBitmap) も stub する。

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// predict の返り (テスト内で握って「認識中」を作るのに型が要る)
type OcrResults = { items: never[] }[]

const dispose = vi.fn(async () => {})
const predict = vi.fn(async () => [{ items: [] }])
const create = vi.fn(async () => ({ dispose, predict }))

vi.mock('@paddleocr/paddleocr-js', () => ({
  PaddleOCR: {
    get create() {
      return create
    },
  },
}))
vi.mock('onnxruntime-web', () => ({ default: {} }))
vi.mock('@/lib/ort/quietOrtLogs', () => ({ quietOrtSessionLogs: () => {} }))

// createImageBitmap は jsdom に無い。close() だけ持つ最小の代物で足りる
// (predict をモックしているので中身は読まれない)
const bitmap = { width: 100, height: 100, close: vi.fn() }
vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))

// モジュールの singleton をテスト間で持ち越さないよう、毎回読み込み直す
async function loadService() {
  vi.resetModules()
  return import('./ocrService')
}

beforeEach(() => {
  dispose.mockClear()
  predict.mockClear()
  create.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
})

describe('disposeOcr', () => {
  test('releases the SDK service once an OCR has loaded it', async () => {
    // Arrange
    const ocr = await loadService()
    await ocr.ocrImageToQuote(new Blob())
    expect(ocr.isOcrReady()).toBe(true)

    // Act
    await ocr.disposeOcr()

    // Assert
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(ocr.isOcrReady()).toBe(false)
  })

  test('rebuilds the service for the next OCR after a release', async () => {
    // Arrange
    const ocr = await loadService()
    await ocr.ocrImageToQuote(new Blob())
    await ocr.disposeOcr()

    // Act
    await ocr.ocrImageToQuote(new Blob())

    // Assert: singleton を捨てていなければ create は 1 回のままになる
    expect(create).toHaveBeenCalledTimes(2)
  })

  test('does nothing when no service was ever created', async () => {
    // Arrange: OCR を 1 度も使わずに編集画面を離れた場合
    const ocr = await loadService()

    // Act
    await ocr.disposeOcr()

    // Assert
    expect(create).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
  })

  test('waits for an in-flight OCR before releasing', async () => {
    // Arrange: 認識中に ORT セッションを release すると挙動が保証されない。
    // predict を握って「認識中」を作る
    let finishPredict: (value: OcrResults) => void = () => {}
    predict.mockImplementationOnce(
      () => new Promise((resolve) => (finishPredict = resolve)),
    )
    const ocr = await loadService()
    // 先に 1 度読み込んでおく (create の await と predict の待ちを分ける)
    const running = ocr.ocrImageToQuote(new Blob())
    await vi.waitFor(() => expect(predict).toHaveBeenCalled())

    // Act: 認識中に画面を離れる
    await ocr.disposeOcr()

    // Assert: まだ解放してはいけない
    expect(dispose).not.toHaveBeenCalled()

    // Act: 認識が終われば、持ち越された解放が引き取られる
    finishPredict([{ items: [] }])
    await running

    // Assert
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1))
  })

  test('keeps the service when the user comes back and starts another OCR', async () => {
    // Arrange: OCR 中に離れ、捌ける前に戻ってきて次の OCR を始める
    let finishFirst: (value: OcrResults) => void = () => {}
    predict.mockImplementationOnce(
      () => new Promise((resolve) => (finishFirst = resolve)),
    )
    const ocr = await loadService()
    const first = ocr.ocrImageToQuote(new Blob())
    await vi.waitFor(() => expect(predict).toHaveBeenCalled())
    await ocr.disposeOcr()

    // Act: 戻ってきたユーザーの 2 本目 → 1 本目が終わる
    const second = ocr.ocrImageToQuote(new Blob())
    finishFirst([{ items: [] }])
    await Promise.all([first, second])

    // Assert: 使っている最中のモデルを捨てない
    expect(dispose).not.toHaveBeenCalled()
    expect(ocr.isOcrReady()).toBe(true)
  })
})
