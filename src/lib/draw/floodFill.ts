// バケツ塗りの領域探索 (docs/35-塗りつぶし計画.md §2)。
//
// クリックした点と「同じ色で繋がった範囲」を求めて mask に立てる。
// ここは画素の配列を受けて配列を返すだけの純粋な計算で、canvas も fabric も
// 触らない (呼び手が getImageData の結果を渡す)。

import type { DrawPoint } from './shapes'

export interface RgbaImage {
  // RGBA が 4 つずつ並んだ生画素 (canvas の getImageData と同じ並び)
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export interface FillBounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface FloodFillOptions {
  // 基準色からこの距離までは「同じ色」とみなす。ペンの線はアンチエイリアス
  // されていて境界の画素が微妙に違うため、0 だと縁が塗り残る
  readonly tolerance: number
  // 求めた領域をこの画素数だけ膨らませる。線との間に 1px の隙間 (ハロー) が
  // 残るのを防ぐ
  readonly dilate: number
}

export interface FloodFillResult {
  // 1 が「塗る画素」。長さは width * height
  readonly mask: Uint8Array
  // 塗る画素の外接矩形。1 画素も塗らないときは null
  readonly bounds: FillBounds | null
  readonly filled: number
}

// 色の距離。人の見た目に合わせる必要は無く、「同じ色か」の判定に足りればよい
// ので、RGB の差の最大値で見る (チェビシェフ距離)。alpha も見る —— 透明な所と
// 白は別物として扱う
function colorDistance(data: Uint8ClampedArray, a: number, b: number): number {
  return Math.max(
    Math.abs(data[a] - data[b]),
    Math.abs(data[a + 1] - data[b + 1]),
    Math.abs(data[a + 2] - data[b + 2]),
    Math.abs(data[a + 3] - data[b + 3]),
  )
}

// mask を上下左右へ radius 画素ぶん広げる。
// 縦横に 1 回ずつ走る (分離型) ので、半径を増やしても O(画素数 × 2)
function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) {
    return mask
  }
  const horizontal = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      if (!mask[row + x]) {
        continue
      }
      const from = Math.max(0, x - radius)
      const to = Math.min(width - 1, x + radius)
      for (let at = from; at <= to; at += 1) {
        horizontal[row + at] = 1
      }
    }
  }
  const grown = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!horizontal[y * width + x]) {
        continue
      }
      const from = Math.max(0, y - radius)
      const to = Math.min(height - 1, y + radius)
      for (let at = from; at <= to; at += 1) {
        grown[at * width + x] = 1
      }
    }
  }
  return grown
}

function boundsOf(
  mask: Uint8Array,
  width: number,
  height: number,
): { bounds: FillBounds | null; filled: number } {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  let filled = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) {
        continue
      }
      filled += 1
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) {
    return { bounds: null, filled: 0 }
  }
  return {
    bounds: { left, top, width: right - left + 1, height: bottom - top + 1 },
    filled,
  }
}

// scanline flood fill。1 画素ずつ積むのではなく、行を左右へ伸ばしきってから
// 上下の行だけを次の種として積む。積む回数が減るので走査が速い。
//
// 4 近傍で繋がりを見る。8 近傍にすると、斜めに置いた線の隙間を擦り抜けて
// 外側まで塗ってしまう
export function floodFillMask(
  image: RgbaImage,
  origin: DrawPoint,
  { tolerance, dilate }: FloodFillOptions,
): FloodFillResult {
  const { data, width, height } = image
  const startX = Math.floor(origin.x)
  const startY = Math.floor(origin.y)
  const mask = new Uint8Array(width * height)

  if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
    return { mask, bounds: null, filled: 0 }
  }

  const target = (startY * width + startX) * 4
  const matches = (x: number, y: number): boolean =>
    mask[y * width + x] === 0 &&
    colorDistance(data, (y * width + x) * 4, target) <= tolerance

  const stack: number[] = [startX, startY]
  while (stack.length > 0) {
    const y = stack.pop() as number
    const seedX = stack.pop() as number
    if (!matches(seedX, y)) {
      continue
    }
    // この行を左右へ伸ばしきる
    let left = seedX
    while (left > 0 && matches(left - 1, y)) {
      left -= 1
    }
    let right = seedX
    while (right < width - 1 && matches(right + 1, y)) {
      right += 1
    }
    const row = y * width
    for (let x = left; x <= right; x += 1) {
      mask[row + x] = 1
    }
    // 上下の行は、繋がった区間ごとに 1 つだけ種を積む
    for (const nextY of [y - 1, y + 1]) {
      if (nextY < 0 || nextY >= height) {
        continue
      }
      let inRun = false
      for (let x = left; x <= right; x += 1) {
        const ok = matches(x, nextY)
        if (ok && !inRun) {
          stack.push(x, nextY)
        }
        inRun = ok
      }
    }
  }

  const grown = dilateMask(mask, width, height, dilate)
  const { bounds, filled } = boundsOf(grown, width, height)
  return { mask: grown, bounds, filled }
}
