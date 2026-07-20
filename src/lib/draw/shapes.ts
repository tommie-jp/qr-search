// ドラッグで置く図形の幾何 (docs/36-お絵かき拡張計画.md §1)。
//
// 矢印・矩形・楕円はどれも「始点から終点へドラッグして形を決める」道具で、
// その形の計算だけをここに置く (DOM も fabric も触らない純関数)。

export interface DrawPoint {
  readonly x: number
  readonly y: number
}

export interface DragRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface ArrowGeometry {
  readonly from: DrawPoint
  readonly to: DrawPoint
  // 先端から生える 2 本のひげ。軸に対して対称
  readonly barbs: readonly [DrawPoint, DrawPoint]
}

// 鏃の長さ = 線の太さ × これ。太い線には大きい鏃が要る
const ARROW_HEAD_SCALE = 4

// 鏃が軸を食い尽くさないための上限 (軸の長さに対する割合)。
// 短い矢を引いたときに「鏃だけ」にならないようにする
const ARROW_HEAD_MAX_RATIO = 0.4

// 軸から鏃が開く角度
const ARROW_HEAD_SPREAD = Math.PI / 7

// 履歴 JSON に何度も載るので、座標は 2 桁までに丸めて短く保つ
const COORD_DECIMALS = 2

function round(value: number): number {
  return Number(value.toFixed(COORD_DECIMALS))
}

// 逆向き (左・上) にドラッグしても幅と高さが正になるように直す。
// fabric の Rect / Ellipse は負の幅を受け付けない
export function normalizeDragRect(from: DrawPoint, to: DrawPoint): DragRect {
  return {
    left: Math.min(from.x, to.x),
    top: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  }
}

// タップと区別するための移動量
export function dragDistance(from: DrawPoint, to: DrawPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

// 線の**中心**がドラッグした矩形の上へ来るよう、左上を太さの半分だけ戻す。
// fabric は left/top を「ストロークを含む見た目の箱」の角として扱うので、
// そのまま渡すとストロークの外縁が角に来て、図形全体が太さの半分だけ
// 内側 (右下) に寄る。ペン・矢印は線の中心がポインタに乗るため、
// 図形も同じ意味に揃える
export function strokeCenteredRect(rect: DragRect, strokeWidth: number): DragRect {
  return {
    left: rect.left - strokeWidth / 2,
    top: rect.top - strokeWidth / 2,
    width: rect.width,
    height: rect.height,
  }
}

export function arrowGeometry(
  from: DrawPoint,
  to: DrawPoint,
  strokeWidth: number,
): ArrowGeometry {
  const shaft = dragDistance(from, to)
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const headLength = Math.min(
    strokeWidth * ARROW_HEAD_SCALE,
    shaft * ARROW_HEAD_MAX_RATIO,
  )
  // 先端から軸の向きへ headLength だけ戻り、そこから左右へ開いた 2 点
  const barb = (spread: number): DrawPoint => ({
    x: to.x - headLength * Math.cos(angle + spread),
    y: to.y - headLength * Math.sin(angle + spread),
  })
  return {
    from,
    to,
    barbs: [barb(-ARROW_HEAD_SPREAD), barb(ARROW_HEAD_SPREAD)],
  }
}

// 軸を 1 本引き、M で筆を上げてから鏃を先端で折り返す。
// Group (Line + Triangle) ではなく Path 1 本にするのは、消しゴム・直列化・
// 選択の扱いが素直になるため (docs/36 §1-2)
export function arrowPathData({ from, to, barbs }: ArrowGeometry): string {
  const [first, second] = barbs
  return [
    `M ${round(from.x)} ${round(from.y)}`,
    `L ${round(to.x)} ${round(to.y)}`,
    `M ${round(first.x)} ${round(first.y)}`,
    `L ${round(to.x)} ${round(to.y)}`,
    `L ${round(second.x)} ${round(second.y)}`,
  ].join(' ')
}
