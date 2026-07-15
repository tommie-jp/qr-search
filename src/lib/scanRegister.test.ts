import { expect, test } from 'vitest'
import {
  isTaggableCode,
  scanRegisterHref,
  scanRegisterMemo,
} from './scanRegister'

test('JAN / ISBN の 13 桁はタグにできる', () => {
  expect(isTaggableCode('9784873115658')).toBe(true)
})

test('itemNo の 20 文字上限を超える英数字コードもタグにできる', () => {
  // タグ案を採った理由そのもの。itemNo (20 文字まで) には入らない
  expect(isTaggableCode('ABCDEFGHIJ0123456789X')).toBe(true)
})

test('日本語・ハイフン・アンダースコアもタグにできる', () => {
  expect(isTaggableCode('抵抗')).toBe(true)
  expect(isTaggableCode('part-a')).toBe(true)
  expect(isTaggableCode('a_b')).toBe(true)
})

test('URL はタグにできない', () => {
  // 外部 URL の QR で新規登録ボタンを出さない
  expect(isTaggableCode('https://example.com/evil')).toBe(false)
})

test('空白を含む複数語はタグにできない', () => {
  expect(isTaggableCode('bjt 2sc')).toBe(false)
})

test('記号入りのコードはタグにできない', () => {
  expect(isTaggableCode('AB.CD')).toBe(false)
  expect(isTaggableCode('AB/CD')).toBe(false)
})

test('空文字・空白だけはタグにできない', () => {
  expect(isTaggableCode('')).toBe(false)
  expect(isTaggableCode('   ')).toBe(false)
})

test('# を付けて渡されてもタグにできない (二重 # を作らない)', () => {
  // 検索窓で #9784873115658 と打った場合。既にタグ検索なので新規登録の
  // 対象ではなく、通せば本文が ##9784873115658 になってしまう
  expect(isTaggableCode('#9784873115658')).toBe(false)
})

test('本文はタイトルを書く空行 2 つの下にタグを置く', () => {
  // 一覧の要約 (memoSummary) は空行を飛ばすので、書く前の要約は
  // #コードになる。1 行目に書名を書けば要約がそれに差し替わる
  expect(scanRegisterMemo('9784873115658')).toBe('\n\n#9784873115658')
})

test('本文のタグは読み取った綴りのまま置く', () => {
  // 正規化 (小文字化) は tags キャッシュ側の仕事。本文は書いたまま
  expect(scanRegisterMemo('ABC-123')).toBe('\n\n#ABC-123')
})

test('リンク先は次番号の編集ページ + code クエリ', () => {
  expect(scanRegisterHref('4952', '9784873115658')).toBe(
    '/edit/4952?code=9784873115658',
  )
})

test('リンクのコードは URL エンコードする', () => {
  expect(scanRegisterHref('4952', '抵抗')).toBe(
    '/edit/4952?code=%E6%8A%B5%E6%8A%97',
  )
})
