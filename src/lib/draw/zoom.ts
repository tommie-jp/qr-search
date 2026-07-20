// ピンチでの拡大とスクロールの計算 (docs/36-お絵かき拡張計画.md §4)。
//
// 拡大は fabric の viewportTransform ではなく **CSS の表示倍率**で行う。
// 描画バッファは論理サイズのままなので viewportTransform で拡大しても
// ぼけ方は変わらず、座標系だけが複雑になる。CSS で拡縮する現行の作りなら
// fabric がポインタ位置を getBoundingClientRect 比で補正してくれるため
// (docs/34 §3)、倍率を動かしても座標変換の追加実装が要らない。
//
// ここは数の計算だけを持つ (DOM も fabric も触らない)。

import type { DrawPoint } from './shapes'

// 1 = 全体がちょうど収まる大きさ。1 未満に縮めても余白が増えるだけなので許さない
export const MIN_ZOOM = 1

// 伸ばしすぎてもぼけるだけ。細部に描き込むには 4 倍あれば足りる
export const MAX_ZOOM = 4

export interface ScrollOffset {
  readonly left: number
  readonly top: number
}

export interface ZoomScrollInput {
  // いまのスクロール位置 (枠の中で、中身をどれだけ送っているか)
  readonly scroll: ScrollOffset
  // 枠の左上から測った指 (ピンチの中心) の位置
  readonly pointer: DrawPoint
  readonly from: number
  readonly to: number
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function pinchSpan(a: DrawPoint, b: DrawPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function pinchCenter(a: DrawPoint, b: DrawPoint): DrawPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// つまんだ点が指の下から動かないようにスクロール位置を求める。
//
// 中身の座標 = (スクロール + 指の位置) / 倍率。これは倍率を変えても
// 変わらない (同じ点をつまみ続けている) ので、新しい倍率での位置から
// 指の位置を引けば、新しいスクロール位置になる。
export function scrollForZoom({ scroll, pointer, from, to }: ZoomScrollInput): ScrollOffset {
  const contentX = (scroll.left + pointer.x) / from
  const contentY = (scroll.top + pointer.y) / from
  return {
    left: Math.max(0, contentX * to - pointer.x),
    top: Math.max(0, contentY * to - pointer.y),
  }
}
