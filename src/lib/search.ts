// 全文検索の検索語ユーティリティ。
// pgroonga への SQL 組み立ては items.ts が行い、ここでは
// ユーザー入力の分割だけを純関数として扱う (DB 非依存でテストしやすくするため)。

// 1 クエリあたりの AND 条件数の上限。
// 語数分だけ WHERE 条件が増えるため、極端に長い入力を防ぐ安全弁。
export const MAX_SEARCH_TERMS = 10

// 半角空白 (\s: space/tab/改行) と全角空白 (　) の連続で分割する。
const TERM_SEPARATOR = /[\s　]+/

// 検索クエリを AND 検索用の語に分割する。
// 空語を除き、重複を除去し、MAX_SEARCH_TERMS 件までに丸める。
export function splitSearchTerms(query: string): string[] {
  const terms = query.split(TERM_SEPARATOR).filter((term) => term.length > 0)
  const unique = [...new Set(terms)]
  return unique.slice(0, MAX_SEARCH_TERMS)
}
