// openBD (https://openbd.jp/) の書誌 API との境界
// (設計は docs/13-書誌自動取得計画.md)。
//
// ISBN をスキャンしたとき、この API を**スマホのブラウザから直接**引く。
// openBD は access-control-allow-origin: * を返すので CORS で弾かれず、
// API キーも要らない。サーバを経由しないので、VPS のコードも設定も
// 増えない (Google Books はキー運用が要るので Phase 1 では使わない)。

export interface BookSummary {
  title: string
  authors: string[]
  publisher: string
  // 表示用に整形済みの刊行年月 ("2012.06")
  pubdate: string
}

const OPENBD_ENDPOINT = 'https://api.openbd.jp/v1/get'

export function openBdUrl(isbn: string): string {
  return `${OPENBD_ENDPOINT}?isbn=${encodeURIComponent(isbn)}`
}

// 以下 2 つは外部データの型を信用しないための入口 (JSON は何でも来る)。
// 読めない値は「無い」ものとして扱い、部分的にでも書誌を組み立てる。
function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

// 刊行日を年月まで整形する。目的は版の見分けなので日はいらない。
// openBD の pubdate は "201206" / "20120621" / "2012-06" と形式が揺れるため、
// 区切り文字は当てにせず数字だけを見る。
export function formatPubdate(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 6) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}`
  }
  if (digits.length === 4) {
    return digits
  }
  return ''
}

// 著者は ONIX の Contributor から取る。summary.author は
// "Boswell,Dustin Foucher,Trevor 角,征典" と著者名を空白で連結した文字列で、
// 名前自体に空白が入りうる以上、区切り位置を復元できない。
// ONIX は 1 人 1 要素の配列なので確実に分けられる。
// 並び順は openBD の返す順のまま使う (SequenceNumber 順に整列済み)。
function authorsFromOnix(onix: unknown): string[] {
  const contributors = asRecord(asRecord(onix).DescriptiveDetail).Contributor
  if (!Array.isArray(contributors)) {
    return []
  }
  return contributors
    .map((c) => asString(asRecord(asRecord(c).PersonName).content))
    .filter(Boolean)
}

// 応答 (JSON.parse 済み) から書誌を取り出す。
// openBD は [書誌] か [null] (収録なし) を返す。
//
// 書名が無いものは null にする。書名は本文の 1 行目 = 一覧の要約になるもので、
// これが無いなら事前入力を書き換える意味がない。
export function parseOpenBdResponse(json: unknown): BookSummary | null {
  if (!Array.isArray(json)) {
    return null
  }
  const entry = asRecord(json[0])
  const summary = asRecord(entry.summary)
  const title = asString(summary.title)
  if (!title) {
    return null
  }
  const onixAuthors = authorsFromOnix(entry.onix)
  const summaryAuthor = asString(summary.author)
  return {
    title,
    authors:
      onixAuthors.length > 0 ? onixAuthors : summaryAuthor ? [summaryAuthor] : [],
    publisher: asString(summary.publisher),
    pubdate: formatPubdate(asString(summary.pubdate)),
  }
}

// ISBN の書誌を引く。収録漏れのときは null (エラーではない)。
// タイムアウトは呼び出し側が signal で持つ (useBookPrefill)。
export async function fetchBook(
  isbn: string,
  signal?: AbortSignal,
): Promise<BookSummary | null> {
  const res = await fetch(openBdUrl(isbn), { signal })
  if (!res.ok) {
    throw new Error(`openBD が HTTP ${res.status} を返しました`)
  }
  return parseOpenBdResponse(await res.json())
}
