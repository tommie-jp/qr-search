import { expect, test } from 'vitest'
import {
  type EnexMedia,
  enmlRejectReason,
  enmlToMarkdown,
  MAX_ENML_DEPTH,
} from './enmlToMarkdown'

const enNote = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${body}</en-note>`

const noMedia = new Map<string, EnexMedia>()

// 大半のテストは本文だけを見る。取りこぼしの数え上げは専用のテストで確かめる
const convert = (body: string, media: ReadonlyMap<string, EnexMedia> = noMedia) =>
  enmlToMarkdown(enNote(body), media).markdown

test('宣言と DOCTYPE と en-note の殻を落として本文だけにする', () => {
  expect(convert('<div>本文</div>')).toBe('本文')
})

// Evernote は 1 行を 1 つの div で包む。段落 (空行) にすると行間が倍に開くため、
// 単なる改行にする (このアプリの memo は remark-breaks で改行を <br> にする)
test('div の並びは段落ではなく改行で継ぐ', () => {
  expect(convert('<div>1 行目</div><div>2 行目</div>')).toBe('1 行目\n2 行目')
})

test('太字・斜体・取り消し線を Markdown にする', () => {
  expect(convert('<div><b>太字</b>と<i>斜体</i>と<s>取消</s></div>')).toBe(
    '**太字**と*斜体*と~~取消~~',
  )
})

// リンクは対応する (要件)
test('リンクを Markdown のリンクにする', () => {
  expect(convert('<div><a href="https://example.com/a">見出し</a></div>')).toBe(
    '[見出し](https://example.com/a)',
  )
})

// フォント・文字サイズは無視する (要件)。span/font は殻だけ落として中身を残す
test('フォントと文字サイズの指定を捨てて中身だけ残す', () => {
  const body =
    '<div><span style="font-size: 24px; font-family: Georgia;">大きい字</span></div>'
  expect(convert(body)).toBe('大きい字')
})

test('見出しを ATX 見出しにする', () => {
  expect(convert('<h1>見出し</h1><div>本文</div>')).toBe('# 見出し\n\n本文')
})

test('箇条書きと番号付きリストを変換する', () => {
  expect(convert('<ul><li>あ</li><li>い</li></ul>')).toBe('-   あ\n-   い')
  expect(convert('<ol><li>あ</li><li>い</li></ol>')).toBe('1.  あ\n2.  い')
})

test('表を GFM の表にする', () => {
  const body =
    '<table><tr><th>型番</th><th>hFE</th></tr><tr><td>2SC1815</td><td>208</td></tr></table>'
  const markdown = convert(body)
  expect(markdown).toContain('| 型番 | hFE |')
  expect(markdown).toContain('| 2SC1815 | 208 |')
})

// **Evernote の表は th を使わない**。turndown-plugin-gfm は見出し行の無い表を
// 生 HTML のまま残すので、そのままだとこのアプリの表示 (生 HTML 無効) で
// 表がまるごと消える。1 行目を見出し行に仕立ててから変換する
test('th の無い表 (Evernote の実際の形) も表にする', () => {
  const body =
    '<table><tbody><tr><td>型番</td><td>hFE</td></tr><tr><td>2SC1815</td><td>208</td></tr></tbody></table>'
  const markdown = convert(body)
  expect(markdown).toContain('| 型番 | hFE |')
  expect(markdown).toContain('| 2SC1815 | 208 |')
  expect(markdown).not.toContain('<table')
})

// Evernote はセルの中身も div で包む。div を改行にする規則をそのまま当てると
// 1 行 1 レコードの GFM 表が縦に割れて壊れる
test('セルの中が div で包まれていても表が崩れない', () => {
  const body =
    '<table><tbody><tr><td><div>型番</div></td><td><div>hFE</div></td></tr>' +
    '<tr><td><div>2SC1815</div></td><td><div>208</div></td></tr></tbody></table>'
  expect(convert(body)).toBe(
    '| 型番 | hFE |\n| --- | --- |\n| 2SC1815 | 208 |',
  )
})

// 表が生 HTML のまま残ると、その中の en-media も変換されず、保存した添付が
// どこからも参照されない行として取り残される
test('th の無い表の中の添付も画像記法になる', () => {
  const body =
    '<table><tbody><tr><td>図</td><td><en-media hash="abc123"/></td></tr></tbody></table>'
  const markdown = convert(body, imageMedia)
  expect(markdown).toContain('![](/api/images/uuid.png)')
  expect(markdown).not.toContain('<table')
})

test('チェックボックスを GFM のチェックボックスにする', () => {
  const body =
    '<div><en-todo checked="true"/>買った</div><div><en-todo/>まだ</div>'
  expect(convert(body)).toBe('- [x] 買った\n- [ ] まだ')
})

test('コードブロックをフェンスにする', () => {
  expect(convert('<pre><code>const a = 1</code></pre>')).toBe(
    '```\nconst a = 1\n```',
  )
})

// --- 添付 (<en-media>) ---

const imageMedia = new Map<string, EnexMedia>([
  ['abc123', { url: '/api/images/uuid.png', isImage: true, label: 'dot.png' }],
])

test('画像の en-media を画像記法にする', () => {
  const body = '<div><en-media type="image/png" hash="abc123"/></div>'
  expect(convert(body, imageMedia)).toBe('![](/api/images/uuid.png)')
})

test('画像でない添付はリンクにする', () => {
  const media = new Map<string, EnexMedia>([
    ['pdf1', { url: '/api/images/uuid.pdf', isImage: false, label: '資料.pdf' }],
  ])
  const body = '<div><en-media type="application/pdf" hash="pdf1"/></div>'
  expect(convert(body, media)).toBe('[資料.pdf](/api/images/uuid.pdf)')
})

// 取り込めなかった添付を黙って消すと、本文だけ見て「元から無かった」と読める。
// レポートに載せると同時に、本文にも跡を残す
test('取り込めなかった添付は跡を残す', () => {
  const body = '<div><en-media type="image/png" hash="missing"/></div>'
  expect(convert(body, noMedia)).toBe('(添付ファイルを取り込めませんでした)')
})

test('暗号化された部分は跡を残す', () => {
  expect(convert('<div><en-crypt>bWFn</en-crypt></div>')).toBe(
    '(暗号化された部分は取り込めませんでした)',
  )
})

// 本文の跡だけだと、利用者は全ノートを目視するまで欠落に気づけない。
// レポートに載せられるよう、戻り値でも数え上げる
test('取り込めなかった添付の hash を返す', () => {
  const body =
    '<div><en-media hash="aaa"/></div><div><en-media hash="bbb"/></div>'
  const result = enmlToMarkdown(enNote(body), noMedia)
  expect(result.missingHashes).toEqual(['aaa', 'bbb'])
})

test('同じ hash を 2 回参照していても 1 度だけ数える', () => {
  const body =
    '<div><en-media hash="aaa"/></div><div><en-media hash="aaa"/></div>'
  expect(enmlToMarkdown(enNote(body), noMedia).missingHashes).toEqual(['aaa'])
})

test('取り込めた添付は取りこぼしに数えない', () => {
  const body = '<div><en-media hash="abc123"/></div>'
  const result = enmlToMarkdown(enNote(body), imageMedia)
  expect(result.missingHashes).toEqual([])
})

test('暗号化された部分の数を返す', () => {
  const body = '<div><en-crypt>a</en-crypt></div><div><en-crypt>b</en-crypt></div>'
  expect(enmlToMarkdown(enNote(body), noMedia).encryptedCount).toBe(2)
})

// --- 安全側の処理 ---

test('script と style は中身ごと落とす', () => {
  const body = '<div>本文</div><script>alert(1)</script><style>b{color:red}</style>'
    expect(convert(body)).toBe('本文')
})

// 生 HTML を素通しすると、memo を別経路 (エクスポート等) で使ったときに危うい。
// turndown は既定で未知のタグを剥がすが、その挙動をテストで固定しておく
test('未知のタグは殻を剥がして中身だけ残す', () => {
  expect(convert('<div><marquee>流れる字</marquee></div>')).toBe('流れる字')
})

// ファイル名は ENEX の書き手が自由に書ける。記法を閉じる文字を混ぜると、
// 意図したリンクを途中で閉じて別のリンク (偽装先) を差し込める
test('添付のファイル名に混ぜた Markdown 記法を殺す', () => {
  const media = new Map<string, EnexMedia>([
    [
      'pdf1',
      {
        url: '/api/images/uuid.pdf',
        isImage: false,
        label: '資料.pdf](https://evil.example "click")[本物',
      },
    ],
  ])
  const markdown = convert('<div><en-media hash="pdf1"/></div>', media)
  expect(markdown).toBe(
    '[資料.pdf\\]\\(https://evil.example "click"\\)\\[本物](/api/images/uuid.pdf)',
  )
  expect(markdown).not.toContain('](https://evil.example')
})

test('空の本文は空文字になる', () => {
  expect(convert('')).toBe('')
})

// --- 変換にかける前の門番 ---
//
// turndown も domino も木を再帰で歩くので、深く入れ子にした ENML は
// 変換が失敗するまでに数十秒の同期処理を回す (実測: 660KB で 23.5 秒)。
// Node は 1 本のイベントループなので、その間アプリ全体が止まる

test('普通の本文は素通しする', () => {
  expect(enmlRejectReason(enNote('<div>本文</div><table><tr><td>a</td></tr></table>'))).toBeNull()
})

test('入れ子が深すぎる本文は変換前に断る', () => {
  const deep = '<div>'.repeat(MAX_ENML_DEPTH + 10) + 'x' + '</div>'.repeat(MAX_ENML_DEPTH + 10)
  expect(enmlRejectReason(deep)).toMatch(/入れ子/)
})

test('大きすぎる本文は変換前に断る', () => {
  expect(enmlRejectReason(`<div>${'あ'.repeat(400_000)}</div>`)).toMatch(/大きすぎ/)
})

// 閉じ忘れ・閉じすぎのある壊れた HTML で深さの数え上げが暴走しないこと
test('壊れた入れ子でも数え上げは止まる', () => {
  expect(enmlRejectReason('</div></div><div><br><img src="x">')).toBeNull()
})
