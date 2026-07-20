// モザイクの画素加工 (docs/36-お絵かき拡張計画.md §3)。
//
// 指定した大きさの升目ごとに平均色で塗り潰す。ここは画素の配列を受けて
// 新しい配列を返すだけの純関数で、canvas も fabric も触らない。

import type { RgbaImage } from './floodFill'

// 囲んだ範囲の短辺をこの数の升目に割る。**粗さを面積に対して決める**のが要点で、
// 固定 px にすると広い範囲を隠したときに升目が細かくなりすぎる。
// 細かいモザイクは拡大やシャープ化で読み戻せるため、粗いままにしておく
export const MIN_MOSAIC_BLOCKS = 12

// 1px の升目はモザイクにならない (元の絵のまま)
const MIN_BLOCK_SIZE = 2

export function mosaicBlockSize(width: number, height: number): number {
  const shortEdge = Math.min(width, height)
  return Math.max(MIN_BLOCK_SIZE, Math.floor(shortEdge / MIN_MOSAIC_BLOCKS))
}

// 升目ごとの平均色で塗り潰した新しい画素を返す (元の画素は書き換えない)
export function pixelate(image: RgbaImage, blockSize: number): RgbaImage {
  const { data, width, height } = image
  const out = new Uint8ClampedArray(data)
  const step = Math.max(1, Math.floor(blockSize))
  if (step === 1) {
    return { data: out, width, height }
  }

  for (let blockTop = 0; blockTop < height; blockTop += step) {
    const bottom = Math.min(blockTop + step, height)
    for (let blockLeft = 0; blockLeft < width; blockLeft += step) {
      const right = Math.min(blockLeft + step, width)

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0
      for (let y = blockTop; y < bottom; y += 1) {
        for (let x = blockLeft; x < right; x += 1) {
          const at = (y * width + x) * 4
          r += data[at]
          g += data[at + 1]
          b += data[at + 2]
          a += data[at + 3]
          count += 1
        }
      }
      if (count === 0) {
        continue
      }
      const average = [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count),
        Math.round(a / count),
      ]
      for (let y = blockTop; y < bottom; y += 1) {
        for (let x = blockLeft; x < right; x += 1) {
          const at = (y * width + x) * 4
          out[at] = average[0]
          out[at + 1] = average[1]
          out[at + 2] = average[2]
          out[at + 3] = average[3]
        }
      }
    }
  }
  return { data: out, width, height }
}
