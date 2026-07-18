// 検出された行/列を「読む順」に並べ替える (docs/24-画像OCR計画.md §2)。
//
// PaddleOCR.js の predict() が返す items は検出器の出力順で、読み順ではない。
// 横書きなら上→下・左→右、日本語の縦書きなら右→左・上→下に並べ直す必要がある。
//
// 縦書きか横書きかは箱の形で決める。SDK 側は縦横比 1.5 以上のクロップを
// 90 度回して認識にかけるので (公式パイプラインと同じ規則)、こちらも
// 同じ 1.5 を境にして「縦長の箱が多数派なら縦書き」と判定する。
//
// ここは純粋な幾何計算だけを持つ (DOM も OCR エンジンも触らない)。

// SDK の OcrResultItem のうち、並べ替えに要る分だけを写した形。
// poly は検出四角形の頂点列 ([x, y] の配列)。
export interface OcrItemLike {
  poly: readonly (readonly number[])[]
  text: string
}

// 箱 1 つ分の外接矩形と本文。
interface Box {
  text: string
  minX: number
  maxX: number
  minY: number
  maxY: number
}

// 縦長と見なす縦横比。SDK の crop が 90 度回転をかける閾値に合わせる。
const VERTICAL_ASPECT_RATIO = 1.5

// 同じ行 (列) と見なす重なりの割合。狭いほうの幅 (高さ) に対する比。
const SAME_GROUP_OVERLAP_RATIO = 0.5

function toBox(item: OcrItemLike): Box | null {
  const text = item.text.trim()
  if (text.length === 0) {
    return null
  }
  const xs = item.poly.map((point) => point[0])
  const ys = item.poly.map((point) => point[1])
  if (xs.length === 0 || ys.length === 0) {
    return null
  }
  if (![...xs, ...ys].every((value) => Number.isFinite(value))) {
    return null
  }
  return {
    text,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

// 縦長の箱が多数派か。縦書きページの判定に使う。
function isVerticalWriting(boxes: readonly Box[]): boolean {
  const vertical = boxes.filter((box) => {
    const width = box.maxX - box.minX
    const height = box.maxY - box.minY
    return width > 0 && height / width >= VERTICAL_ASPECT_RATIO
  })
  return vertical.length * 2 > boxes.length
}

// 1 次元の区間が十分に重なっているか (同じ行・同じ列かの判定)。
function overlapsEnough(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart)
  if (overlap <= 0) {
    return false
  }
  const narrower = Math.min(aEnd - aStart, bEnd - bStart)
  if (narrower <= 0) {
    return false
  }
  return overlap / narrower >= SAME_GROUP_OVERLAP_RATIO
}

// 主軸 (縦書きなら x、横書きなら y) の重なりで箱をまとめ、
// グループ間・グループ内をそれぞれ指定の向きに並べる。
function groupAndSort(
  boxes: readonly Box[],
  // 主軸: この区間が重なる箱を同じグループにする
  mainStart: (box: Box) => number,
  mainEnd: (box: Box) => number,
  // グループの並び順の基準 (小さい順に並べたい値を返す)
  groupRank: (group: readonly Box[]) => number,
  // グループ内の並び順の基準
  memberRank: (box: Box) => number,
): string[] {
  const groups: Box[][] = []

  // 主軸の開始位置順に見ていくと、重なる箱が隣り合うのでまとめやすい。
  const sorted = [...boxes].sort((a, b) => mainStart(a) - mainStart(b))
  for (const box of sorted) {
    const hit = groups.find((group) =>
      group.some((member) =>
        overlapsEnough(
          mainStart(box),
          mainEnd(box),
          mainStart(member),
          mainEnd(member),
        ),
      ),
    )
    if (hit) {
      hit.push(box)
    } else {
      groups.push([box])
    }
  }

  return groups
    .map((group) => [...group].sort((a, b) => memberRank(a) - memberRank(b)))
    .sort((a, b) => groupRank(a) - groupRank(b))
    .flatMap((group) => group.map((box) => box.text))
}

// 認識結果を読み順の行の配列にして返す。
// 空文字や座標の壊れた item は落とす (呼び手は行数 0 を「見つからなかった」に使う)。
export function orderOcrItems(items: readonly OcrItemLike[]): string[] {
  const boxes = items
    .map(toBox)
    .filter((box): box is Box => box !== null)

  if (boxes.length === 0) {
    return []
  }

  if (isVerticalWriting(boxes)) {
    // 縦書き: 列を右から左へ、列の中は上から下へ。
    // 列の順は「その列でいちばん右の端」で決める (列幅が揃わなくてもぶれない)。
    return groupAndSort(
      boxes,
      (box) => box.minX,
      (box) => box.maxX,
      (group) => -Math.max(...group.map((box) => box.maxX)),
      (box) => box.minY,
    )
  }

  // 横書き: 行を上から下へ、行の中は左から右へ。
  return groupAndSort(
    boxes,
    (box) => box.minY,
    (box) => box.maxY,
    (group) => Math.min(...group.map((box) => box.minY)),
    (box) => box.minX,
  )
}
