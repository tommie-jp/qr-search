import { expect, test } from 'vitest'
import {
  isIsbn,
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
  // #コードになる。1 行目に書名を書けば要約がそれに差し替わる。
  // 4901777300446 は JAN (書籍ではない) なので #book は付かない
  expect(scanRegisterMemo('4901777300446')).toBe('\n\n#4901777300446')
})

test('本文のタグは読み取った綴りのまま置く', () => {
  // 正規化 (小文字化) は tags キャッシュ側の仕事。本文は書いたまま
  expect(scanRegisterMemo('ABC-123')).toBe('\n\n#ABC-123')
})

test('ISBN なら #book も付ける', () => {
  // 978/979 始まりの 13 桁は書籍用に予約された接頭辞 (Bookland) なので
  // コードの中身だけで書籍と分かる
  expect(scanRegisterMemo('9784873115658')).toBe('\n\n#9784873115658 #book')
})

test('書誌が取れたら書名・著者・出版社を上に置く', () => {
  // 1 行目が書名になるので、一覧の要約 (memoSummary) が書名になる。
  // 空行を 1 つ挟んでタグ。空行は自分のメモを書く場所
  // (docs/13-書誌自動取得計画.md §3)
  const memo = scanRegisterMemo('9784873115658', {
    title: 'リーダブルコード',
    authors: ['Boswell, Dustin', '角, 征典'],
    publisher: 'オーム社',
    pubdate: '2012.06',
  })
  expect(memo).toBe(
    'リーダブルコード\nBoswell, Dustin / 角, 征典\nオーム社 (2012.06)\n\n#9784873115658 #book',
  )
})

test('書誌が無ければ従来どおり空行 2 つ + タグ', () => {
  // openBD の収録漏れ・通信失敗。導線は止めず手で書く
  expect(scanRegisterMemo('9784873115658', null)).toBe(
    '\n\n#9784873115658 #book',
  )
})

test('書誌の欠けた項目は行ごと落とす (空行を作らない)', () => {
  const memo = scanRegisterMemo('9784873115658', {
    title: 'タイトルだけの本',
    authors: [],
    publisher: '',
    pubdate: '',
  })
  expect(memo).toBe('タイトルだけの本\n\n#9784873115658 #book')
})

test('刊行年月が無ければ出版社だけ、出版社が無ければ刊行年月だけ', () => {
  const base = { title: '本', authors: [] }
  expect(scanRegisterMemo('9784873115658', { ...base, publisher: 'オーム社', pubdate: '' })).toBe(
    '本\nオーム社\n\n#9784873115658 #book',
  )
  expect(scanRegisterMemo('9784873115658', { ...base, publisher: '', pubdate: '2012.06' })).toBe(
    '本\n2012.06\n\n#9784873115658 #book',
  )
})

test('979 始まり (ISBN-13 の新しい接頭辞) も ISBN として扱う', () => {
  expect(isIsbn('9791234567896')).toBe(true)
})

test('9790 始まり (ISMN = 印刷楽譜) は ISBN ではない', () => {
  // 979 帯のうち 9790 だけは楽譜用に予約されている。チェックデジットは
  // 正しいので、接頭辞で外さないと楽譜に #book が付く
  expect(isIsbn('9790123456785')).toBe(false)
})

test('JAN (書籍以外) は ISBN ではない', () => {
  expect(isIsbn('4901777300446')).toBe(false)
})

test('チェックデジットが合わない 978 始まりは ISBN ではない', () => {
  // 手で打った番号の打ち間違い。スキャン経由なら zxing が検算済みだが、
  // 検索窓に手入力した場合はここだけが頼り
  expect(isIsbn('9784873115659')).toBe(false)
})

test('桁数が違う数字は ISBN ではない', () => {
  expect(isIsbn('978487311565')).toBe(false) // 12 桁
  expect(isIsbn('97848731156580')).toBe(false) // 14 桁
})

test('数字以外を含むものは ISBN ではない', () => {
  expect(isIsbn('978-4-87311-565-8')).toBe(false)
  expect(isIsbn('')).toBe(false)
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
