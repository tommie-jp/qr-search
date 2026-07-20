// 描画色の合成 (docs/36-お絵かき拡張計画.md §2)。
//
// fabric のブラシ色は ctx.strokeStyle にそのまま渡るので、rgba() を与えれば
// そのまま半透明で描ける (BaseBrush で確認済み)。

// マーカーの透け具合。濃すぎると下の文字が読めず、薄すぎると引いた跡が
// 判らない。蛍光ペンとして見える辺り
export const MARKER_ALPHA = 0.35

// <input type="color"> が返す 6 桁の 16 進だけを受ける (drawPrefs と同じ線引き)
const HEX_RE = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

export function withAlpha(hexColor: string, alpha: number): string {
  const matched = HEX_RE.exec(hexColor)
  // 読めない色でキャンバスを壊さない。黒に落として描けるようにする
  const [r, g, b] = matched
    ? [matched[1], matched[2], matched[3]].map((part) => parseInt(part, 16))
    : [0, 0, 0]
  const clamped = Math.min(1, Math.max(0, alpha))
  return `rgba(${r}, ${g}, ${b}, ${clamped})`
}

export function markerColor(hexColor: string): string {
  return withAlpha(hexColor, MARKER_ALPHA)
}
