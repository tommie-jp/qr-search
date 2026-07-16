// 書誌の共通の型と整形 (設計は docs/13-書誌自動取得計画.md)。
//
// openBD と NDL サーチという 2 つの API から同じ形に均して受け取るため、
// どちらの境界モジュール (openbd.ts / ndl.ts) からも参照できるここに置く。
// この 2 つは互いの API を知らず、循環 import も作らない。

export interface BookSummary {
  title: string
  authors: string[]
  publisher: string
  // 表示用に整形済みの刊行年月 ("2012.06")
  pubdate: string
}

// 外部データの型を信用しないための入口 (JSON も XML も何でも来る)。
// 読めない値は「無い」ものとして扱い、部分的にでも書誌を組み立てる。
// 商品情報の境界 (yahooShopping.ts) もここを共用する (二重定義しない)。
export function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

// 刊行日を年月に整形する。目的は版の見分けなので日はいらない。
//
// 形式が API ごとに揺れる:
//   openBD … "201206" / "20120621" / "2012-06"
//   NDL   … "2012.6" / "1996.2"  (月が 0 埋めされない)
// そこで「4 桁の年 + 区切り + 1〜2 桁の月」として読み、月は 0 埋めして返す。
// 数字だけを抜き出して桁数で判断すると、NDL の "2012.6" が 5 桁になって落ちる。
export function formatPubdate(raw: string): string {
  const matched = /^\s*(\d{4})(?:\D{0,2}(\d{1,2}))?/.exec(raw)
  if (!matched) {
    return ''
  }
  const [, year, month] = matched
  return month ? `${year}.${month.padStart(2, '0')}` : year
}
