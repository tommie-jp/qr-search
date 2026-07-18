import { expect, test } from 'vitest'
import { allImageNames, firstImageName } from './memoImages'

const NAME = '0421547b-ee29-4613-a6d4-da0f41f94054.jpg'
const OTHER = '11108562-47b2-4c00-846d-23dd7e804ff8.png'

test('本文に貼られた画像の名前を返す', () => {
  expect(firstImageName(`写真\n![](/api/images/${NAME})`)).toBe(NAME)
})

test('複数あれば最初のものを返す', () => {
  expect(
    firstImageName(`![](/api/images/${NAME})\n![](/api/images/${OTHER})`),
  ).toBe(NAME)
})

test('alt テキストがあっても読める', () => {
  // 書影は ![書影|120](url) の形で入る (scanRegister.ts)
  expect(firstImageName(`書名\n![書影|120](/api/images/${NAME})`)).toBe(NAME)
})

test('画像が無ければ null', () => {
  expect(firstImageName('ただのメモ')).toBeNull()
  expect(firstImageName('')).toBeNull()
})

test('画像ではないリンクは拾わない', () => {
  // `[...]` は画像ではなくリンク。サムネにする対象ではない
  expect(firstImageName(`[説明](/api/images/${NAME})`)).toBeNull()
})

test('外部の画像は拾わない (サムネを持っているのは自前の画像だけ)', () => {
  expect(firstImageName('![](https://example.com/photo.jpg)')).toBeNull()
})

test('名前の形が不正なものは拾わない', () => {
  // isValidImageName と同じ線引き。パスを組み立てる値なので書式を確かめる
  expect(firstImageName('![](/api/images/../../etc/passwd)')).toBeNull()
  expect(firstImageName('![](/api/images/notauuid.jpg)')).toBeNull()
  expect(firstImageName(`![](/api/images/${NAME.replace('.jpg', '.svg')})`)).toBeNull()
})

test('コードの中の画像記法は拾わない', () => {
  // タグ・プロパティと同じ流儀 (コードの中は記法として読まない)
  expect(firstImageName('```md\n![](/api/images/' + NAME + ')\n```')).toBeNull()
  expect(firstImageName('`![](/api/images/' + NAME + ')`')).toBeNull()
})

test('コードの後ろの画像は拾う', () => {
  expect(
    firstImageName('```md\nexample\n```\n![](/api/images/' + NAME + ')'),
  ).toBe(NAME)
})

test('allImageNames: 自前画像をすべて出現順に返す', () => {
  expect(
    allImageNames(`![](/api/images/${NAME})\n本文\n![](/api/images/${OTHER})`),
  ).toEqual([NAME, OTHER])
})

test('allImageNames: 同じ画像は 1 度だけ (重複除去)', () => {
  expect(
    allImageNames(`![](/api/images/${NAME})\n![](/api/images/${NAME})`),
  ).toEqual([NAME])
})

test('allImageNames: 外部画像・不正名・コード内は除く', () => {
  expect(
    allImageNames(
      `![](https://example.com/x.jpg)\n` +
        `![](/api/images/notauuid.jpg)\n` +
        '`![](/api/images/' + OTHER + ')`\n' +
        `![](/api/images/${NAME})`,
    ),
  ).toEqual([NAME])
})

test('allImageNames: 画像が無ければ空配列', () => {
  expect(allImageNames('ただのメモ')).toEqual([])
})
