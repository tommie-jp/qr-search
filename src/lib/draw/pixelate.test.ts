import { describe, expect, test } from 'vitest'
import { MIN_MOSAIC_BLOCKS, mosaicBlockSize, pixelate } from './pixelate'

// 幅 w・高さ h の画素を作る。fill(x, y) が [r, g, b, a] を返す
function imageOf(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y)
      const at = (y * width + x) * 4
      data[at] = r
      data[at + 1] = g
      data[at + 2] = b
      data[at + 3] = a
    }
  }
  return { data, width, height }
}

// (x, y) の RGBA を読む
function pixelAt(
  image: { data: Uint8ClampedArray; width: number },
  x: number,
  y: number,
): number[] {
  const at = (y * image.width + x) * 4
  return [...image.data.slice(at, at + 4)]
}

describe('pixelate', () => {
  test('replaces every pixel of a block with the block average', () => {
    // Arrange — 左半分が黒、右半分が白の 2x1 を 1 ブロックにまとめる
    const image = imageOf(2, 1, (x) =>
      x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )

    // Act
    const result = pixelate(image, 2)

    // Assert — 平均のグレーで塗り潰される
    expect(pixelAt(result, 0, 0)).toEqual([128, 128, 128, 255])
    expect(pixelAt(result, 1, 0)).toEqual([128, 128, 128, 255])
  })

  test('keeps blocks independent of each other', () => {
    // Arrange — 4x1。前半は黒、後半は白。ブロックは 2 画素
    const image = imageOf(4, 1, (x) =>
      x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )

    // Act
    const result = pixelate(image, 2)

    // Assert — 混ざらず、黒のまま / 白のまま
    expect(pixelAt(result, 0, 0)).toEqual([0, 0, 0, 255])
    expect(pixelAt(result, 3, 0)).toEqual([255, 255, 255, 255])
  })

  test('averages across rows as well as columns', () => {
    // Arrange — 市松模様の 2x2 を 1 ブロックに
    const image = imageOf(2, 2, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )

    // Act
    const result = pixelate(image, 2)

    // Assert
    expect(pixelAt(result, 0, 0)).toEqual([128, 128, 128, 255])
    expect(pixelAt(result, 1, 1)).toEqual([128, 128, 128, 255])
  })

  test('handles a trailing block that does not fill the width', () => {
    // Arrange — 幅 3 をブロック 2 で割ると、右端が 1 画素だけ残る
    const image = imageOf(3, 1, (x) =>
      x === 2 ? [10, 20, 30, 255] : [0, 0, 0, 255],
    )

    // Act
    const result = pixelate(image, 2)

    // Assert — 端のブロックはその 1 画素の色のまま (割り算が壊れない)
    expect(pixelAt(result, 2, 0)).toEqual([10, 20, 30, 255])
  })

  test('leaves the image untouched when the block is 1 pixel', () => {
    // Arrange
    const image = imageOf(2, 1, (x) => [x * 10, 0, 0, 255])

    // Act
    const result = pixelate(image, 1)

    // Assert
    expect([...result.data]).toEqual([...image.data])
  })

  test('does not modify the given image', () => {
    // Arrange
    const image = imageOf(2, 1, (x) =>
      x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )
    const before = [...image.data]

    // Act
    pixelate(image, 2)

    // Assert
    expect([...image.data]).toEqual(before)
  })
})

describe('mosaicBlockSize', () => {
  test('splits the shorter edge into a fixed number of blocks', () => {
    // Arrange & Act
    const size = mosaicBlockSize(400, 200)

    // Assert — 短辺 200 が MIN_MOSAIC_BLOCKS 個に割れる大きさ
    expect(size).toBe(Math.floor(200 / MIN_MOSAIC_BLOCKS))
  })

  test('never returns less than 2 pixels', () => {
    // Arrange & Act & Assert — 小さく囲っても、1px は「モザイク」にならない
    expect(mosaicBlockSize(4, 4)).toBeGreaterThanOrEqual(2)
  })

  test('is coarse enough that detail is unrecoverable', () => {
    // Arrange & Act — 顔が写る程度の範囲
    const size = mosaicBlockSize(300, 300)

    // Assert — 細かすぎるモザイクは拡大で読み戻せるので、粗さを固定する
    expect(size).toBeGreaterThanOrEqual(10)
  })
})
