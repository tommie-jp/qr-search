// ピンチでの拡大と送り (パン) の計算 (docs/36-お絵かき拡張計画.md §4)。
//
// 拡大は fabric の viewportTransform ではなく **CSS の表示倍率**で行う。
// 描画バッファは論理サイズのままなので viewportTransform で拡大しても
// ぼけ方は変わらず、座標系だけが複雑になる。CSS で拡縮する現行の作りなら
// fabric がポインタ位置を getBoundingClientRect 比で補正してくれるため
// (docs/34 §3)、倍率を動かしても座標変換の追加実装が要らない。
//
// **送りはスクロールではなく transform で行う** (docs/36 §4-3)。
// スクロールできる親を canvas の上に置くと、fabric の座標計算が
// 「イベントの target の祖先」のスクロール量を足す一方、canvas 側の基準位置は
// 「canvas の祖先」のスクロール量で引くため、指が canvas の外へ出た瞬間に
// 両者の対象がずれて、スクロール量ぶんちょうど座標が飛ぶ。
//
// ここは数の計算だけを持つ (DOM も fabric も触らない)。

import type { DrawPoint } from './shapes'

// 1 = 全体がちょうど収まる大きさ。1 未満に縮めても余白が増えるだけなので許さない
export const MIN_ZOOM = 1

// 伸ばしすぎてもぼけるだけ。細部に描き込むには 4 倍あれば足りる
export const MAX_ZOOM = 4

// 中身をどれだけ左・上へ送っているか (スクロール位置と同じ向き)
export interface PanOffset {
  readonly left: number
  readonly top: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface ZoomPanInput {
  readonly pan: PanOffset
  // 枠の左上から測った指 (ピンチの中心) の位置
  readonly pointer: DrawPoint
  readonly from: number
  readonly to: number
}

export function clampZoom(zoom: number): number {
  // NaN だけを既定へ逃がす。Infinity は Math.min / Math.max が自然に
  // 上限・下限へ丸めるので、まとめて isFinite で弾いてはいけない —
  // 「clampZoom(Infinity) = 上限」を期待する呼び手が 1 を受け取ってしまう
  if (Number.isNaN(zoom)) {
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

export interface PinchPanInput {
  // ジェスチャ開始時の送りと倍率
  readonly pan: PanOffset
  readonly from: number
  // 開始時の 2 本指の中心と、いまの中心 (枠の左上から測った値)
  readonly startCenter: DrawPoint
  readonly currentCenter: DrawPoint
  readonly to: number
}

// つまんだ中身の点が、動いた指の中心に付いてくるように送りを求める。
//
// 開始時に指の中心の下にあった中身の座標 = (送り + 中心) / 倍率。
// ピンチの間じゅう「その点が今の中心の下に居続ける」ようにするので、
// 新しい倍率での位置から今の中心を引けば新しい送りになる。
// 指を開けば拡大、平行移動すれば送り、が 1 つの式で同時に効く
export function panForPinch({
  pan,
  from,
  startCenter,
  currentCenter,
  to,
}: PinchPanInput): PanOffset {
  const contentX = (pan.left + startCenter.x) / from
  const contentY = (pan.top + startCenter.y) / from
  return {
    left: Math.max(0, contentX * to - currentCenter.x),
    top: Math.max(0, contentY * to - currentCenter.y),
  }
}

// ホイール・ボタン用: 軸の 1 点が動かない拡大 (中心が動かないピンチと同じ)
export function panForZoom({ pan, pointer, from, to }: ZoomPanInput): PanOffset {
  return panForPinch({ pan, from, startCenter: pointer, currentCenter: pointer, to })
}

// 中身が枠から出ている分までしか送らない。収まっているなら送らない
// (中央に置いたままにする)
export function clampPan(pan: PanOffset, content: Size, view: Size): PanOffset {
  return {
    left: Math.min(Math.max(0, pan.left), Math.max(0, content.width - view.width)),
    top: Math.min(Math.max(0, pan.top), Math.max(0, content.height - view.height)),
  }
}
