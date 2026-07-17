// 一覧の要約表示用に、memo の先頭行から Markdown 記法を取り除く。
// 表示専用の簡易変換 (正確なパースは表示側の react-markdown が担う)

// 行頭の記法: 見出し / 引用 / 箇条書き / 番号リスト / チェックボックス
const LINE_PREFIX = /^\s*(?:#{1,6}\s+|>\s*|(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s*)?)/

// インライン記法 → 中身のテキストだけ残す。
// 単独アンダースコアの強調 (_em_) は部品名 (ABC_DEF) と衝突するため対象外
const INLINE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'], // 画像 → alt テキスト
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'], // リンク → リンクテキスト
  [/(\*\*|__)(.*?)\1/g, '$2'], // 太字
  [/\*(.*?)\*/g, '$1'], // 斜体 (*)
  [/~~(.*?)~~/g, '$1'], // 取り消し線
  [/`([^`]*)`/g, '$1'], // インラインコード
]

// コードフェンスの区切り行 (```lang / ~~~)。中身ではないので飛ばす。
export const FENCE_MARKER = /^\s*(```|~~~)/

// 1 行から Markdown 記法を取り除いて表示用のテキストにする。
// memoPreview (一覧の本文プレビュー) も同じ剥がし方を使うので公開している。
export function stripLineMarkdown(line: string): string {
  let text = line
  // 引用の入れ子 (> > ...) などに備えて、変化しなくなるまで行頭記法を剥がす
  for (let prev = ''; prev !== text; ) {
    prev = text
    text = text.replace(LINE_PREFIX, '')
  }
  for (const [pattern, replacement] of INLINE_PATTERNS) {
    text = text.replace(pattern, replacement)
  }
  return text.trim()
}

export function memoSummary(memo: string): string {
  for (const line of memo.split(/\r?\n/)) {
    if (FENCE_MARKER.test(line)) {
      continue
    }
    const text = stripLineMarkdown(line)
    if (text) {
      return text
    }
  }
  return ''
}
