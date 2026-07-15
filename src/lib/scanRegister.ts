import { parseTagToken } from './tags'

// スキャンした未登録コードから新規ノートを作る導線の組み立て
// (設計は docs/10-スキャン新規登録計画.md)。
//
// コードは itemNo ではなくタグ (#9784873115658) として本文に置く。
// 正本はメモ本文というこのアプリの流儀に揃い、tags 派生キャッシュ・
// タグリンク・タグチップが既存の仕組みでそのまま動く。

// このコードをタグとして本文に置けるか。
//
// 判定は tags.ts の parseTagToken に委ねる。タグ記法の正規表現をここへ
// 書き写すと、tags 側が変わったとき「ボタンは出るのにタグにならない」
// (逆も) が黙って起きる。#付きで渡して「タグ 1 個ちょうど」かを聞く。
export function isTaggableCode(code: string): boolean {
  return parseTagToken(`#${code}`) !== null
}

// 事前入力する本文。タイトルを書くための空行 2 つの下にタグを置く。
//
// 一覧の要約 (memoSummary) は空行を飛ばすので、何も書かないうちは要約が
// #コードになり「タイトルはスキャンしたコード」が満たされる。1 行目に
// 書名・部品名を書けば要約がそれへ差し替わり、タグは下に残る。
// CodeMirror の既定カーソル位置 (文書先頭) がそのままタイトルを書く位置。
//
// タグは読み取った綴りのまま置く (正規化は tags キャッシュ側の仕事)。
export function scanRegisterMemo(code: string): string {
  return `\n\n#${code}`
}

// 「新規登録」ボタンのリンク先。itemNo は採番済みの次番号を渡す。
export function scanRegisterHref(itemNo: string, code: string): string {
  return `/edit/${itemNo}?code=${encodeURIComponent(code)}`
}
