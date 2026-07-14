// 全文検索の検索語ユーティリティ。
// pgroonga への SQL 組み立ては items.ts が行い、ここでは
// ユーザー入力の解析だけを純関数として扱う (DB 非依存でテストしやすくするため)。
//
// 検索窓の文法 (詳細は docs/05-全文検索の使い方.md):
//   - 空白 (半角/全角) 区切り = AND
//   - "OR" (大小無視) または "|" = OR
//   - OR は空白より弱く結合する。例: `抵抗 1608 OR コンデンサ`
//     → (抵抗 AND 1608) OR コンデンサ という DNF (AND グループの OR)
//   - ダブルクォートで囲むと演算子解釈を抑止したリテラル語になる。
//     例: `"or"` は OR 演算子ではなく語 "or"、`"A|B"` は語 "A|B"
// 生の演算子構文は &@ に渡さず、ここで素の語に分解してから
// items.ts がパラメータとして渡す (構文エラー/エスケープ漏れを避ける)。

// 1 クエリあたりの語数の上限 (全 OR グループ合計)。
// 語数分だけ WHERE 条件が増えるため、極端に長い入力を防ぐ安全弁。
export const MAX_SEARCH_TERMS = 10

// 半角空白 (\s: space/tab/改行) と全角空白 (　) の連続で分割する。
const TERM_SEPARATOR = /[\s　]+/

// 空白区切りの語配列を返す (重複除去・上限つき)。OR/引用は解釈しない。
// 後方互換のために残す薄いユーティリティ。
export function splitSearchTerms(query: string): string[] {
  const terms = query.split(TERM_SEPARATOR).filter((term) => term.length > 0)
  const unique = [...new Set(terms)]
  return unique.slice(0, MAX_SEARCH_TERMS)
}

// 引用されていない単独語がこれ (大小無視) のとき OR 演算子とみなす。
const OR_KEYWORD = 'or'
const PIPE = '|'
const QUOTE = '"'

function isSpace(ch: string): boolean {
  return /[\s　]/.test(ch)
}

type Token = { type: 'term'; value: string } | { type: 'or' }

// 1 パスの状態機械で入力をトークン列へ分解する。
// 引用内は空白・"|"・"OR" をすべて文字として扱い、引用を含む語は
// OR 演算子に昇格させない (これが `"or"` をリテラルにする仕組み)。
function tokenize(query: string): Token[] {
  const tokens: Token[] = []
  let buf = ''
  let hasChars = false // 現トークンに文字が入ったか (空引用 "" の検出用)
  let quotedHere = false // 現トークンが引用を含むか (OR 昇格の抑止用)

  const flush = () => {
    if (!hasChars) return
    if (!quotedHere && buf.toLowerCase() === OR_KEYWORD) {
      tokens.push({ type: 'or' })
    } else if (buf.length > 0) {
      tokens.push({ type: 'term', value: buf })
    }
    buf = ''
    hasChars = false
    quotedHere = false
  }

  let i = 0
  while (i < query.length) {
    const ch = query[i]
    if (ch === QUOTE) {
      quotedHere = true
      hasChars = true
      i++
      while (i < query.length && query[i] !== QUOTE) {
        buf += query[i]
        i++
      }
      i++ // 閉じ quote を読み飛ばす (未閉じなら while が末尾で終わっており無害)
      continue
    }
    if (isSpace(ch) || ch === PIPE) {
      flush()
      if (ch === PIPE) tokens.push({ type: 'or' })
      i++
      continue
    }
    buf += ch
    hasChars = true
    i++
  }
  flush()
  return tokens
}

// 検索クエリを DNF (AND グループの OR) に解析する。
// 返り値 string[][] は「グループ間 OR・グループ内 AND」を表す。
// 例: `抵抗 1608 OR コンデンサ` → [['抵抗','1608'], ['コンデンサ']]
// 各グループ内で空語・重複語を除去し、空グループ・重複グループを畳み、
// 語の総数を MAX_SEARCH_TERMS で全体キャップする。
export function parseSearchQuery(query: string): string[][] {
  const tokens = tokenize(query)

  // OR トークンでグループを区切る。
  const groups: string[][] = [[]]
  for (const token of tokens) {
    if (token.type === 'or') {
      groups.push([])
    } else {
      groups[groups.length - 1].push(token.value)
    }
  }

  // グループ内で空語・重複語を除去し、空グループを落とす。
  const cleaned = groups
    .map((group) => [...new Set(group.filter((term) => term.length > 0))])
    .filter((group) => group.length > 0)

  // 同一内容のグループを畳む (順序は維持)。
  const seen = new Set<string>()
  const unique: string[][] = []
  for (const group of cleaned) {
    const key = JSON.stringify(group)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(group)
  }

  // 語の総数を上限で丸める (WHERE 肥大の安全弁)。
  const capped: string[][] = []
  let budget = MAX_SEARCH_TERMS
  for (const group of unique) {
    if (budget <= 0) break
    const taken = group.slice(0, budget)
    budget -= taken.length
    capped.push(taken)
  }
  return capped
}
