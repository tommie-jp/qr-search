import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { decodeResourceData, parseEnex } from './parseEnex'

// 1x1 の透明 PNG。実物の ENEX と同じく base64 で埋める
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64')
const PNG_MD5 = createHash('md5').update(PNG_BYTES).digest('hex')

// ENML は CDATA に入る。中に独自の宣言と DOCTYPE を持つのが実物の形
const enml = (body: string) => `<![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${body}</en-note>]]>`

const enex = (notes: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20260720T000000Z" application="Evernote" version="10.98.3">
${notes}
</en-export>`

const fullNote = `
  <note>
    <title>2SC1815 のストック</title>
    <content>${enml('<div>hFE=208</div>')}</content>
    <created>20240115T093000Z</created>
    <updated>20240220T101500Z</updated>
    <tag>電子工作</tag>
    <tag>トランジスタ</tag>
    <note-attributes>
      <author>tommie</author>
    </note-attributes>
    <resource>
      <data encoding="base64">${PNG_BASE64}</data>
      <mime>image/png</mime>
      <width>1</width>
      <resource-attributes>
        <file-name>dot.png</file-name>
      </resource-attributes>
    </resource>
  </note>`

test('題名・本文・タグ・日時・添付を取り出す', () => {
  const notes = parseEnex(enex(fullNote))

  expect(notes).toHaveLength(1)
  const note = notes[0]
  expect(note.title).toBe('2SC1815 のストック')
  expect(note.content).toContain('<div>hFE=208</div>')
  expect(note.tags).toEqual(['電子工作', 'トランジスタ'])
  expect(note.createdAt).toEqual(new Date(Date.UTC(2024, 0, 15, 9, 30, 0)))
  expect(note.updatedAt).toEqual(new Date(Date.UTC(2024, 1, 20, 10, 15, 0)))

  expect(note.resources).toHaveLength(1)
  const resource = note.resources[0]
  expect(resource.mime).toBe('image/png')
  expect(resource.fileName).toBe('dot.png')
  expect(Buffer.from(decodeResourceData(resource))).toEqual(PNG_BYTES)
})

// 復号したバイト列を全件ぶん抱えるとメモリが跳ねるので、base64 のまま持ち、
// 保存する直前に 1 件ずつ復号する
test('添付は base64 のまま持ち、復号は要求されたときだけ行う', () => {
  const [note] = parseEnex(enex(fullNote))
  expect(note.resources[0].base64).toBe(PNG_BASE64)
  // Prisma の Bytes は ArrayBuffer 実体の Uint8Array だけを受ける。
  // Buffer の共有プールを持ち出すと隣の添付まで書き込まれうる
  const data = decodeResourceData(note.resources[0])
  expect(data.byteLength).toBe(PNG_BYTES.byteLength)
  expect(data.buffer.byteLength).toBe(PNG_BYTES.byteLength)
})

// 本文からの参照 (<en-media hash>) と突き合わせるための鍵。
// ENEX は hash を持たないので、復号したバイト列から自分で計算する
test('添付の md5 を復号したバイト列から計算する', () => {
  const [note] = parseEnex(enex(fullNote))
  expect(note.resources[0].md5).toBe(PNG_MD5)
})

test('1 ファイルに複数ノートが入っていても全件返す', () => {
  const notes = parseEnex(
    enex(`
      <note><title>一つ目</title><content>${enml('<div>A</div>')}</content></note>
      <note><title>二つ目</title><content>${enml('<div>B</div>')}</content></note>
    `),
  )
  expect(notes.map((note) => note.title)).toEqual(['一つ目', '二つ目'])
})

test('タグ・添付・日時が無いノートも読める', () => {
  const [note] = parseEnex(
    enex(`<note><title>素のノート</title><content>${enml('<div>本文</div>')}</content></note>`),
  )
  expect(note.tags).toEqual([])
  expect(note.resources).toEqual([])
  expect(note.createdAt).toBeNull()
  expect(note.updatedAt).toBeNull()
})

// 題名は一覧の要約になる。無題のノートでも取り込めるよう空文字で通す
test('題名が無いノートは空文字になる', () => {
  const [note] = parseEnex(
    enex(`<note><content>${enml('<div>本文</div>')}</content></note>`),
  )
  expect(note.title).toBe('')
})

// 数値に見える題名を数へ変換されると "1996.10" が 1996.1 に化ける (ndlSearch と同じ罠)
test('数字だけの題名を数値に変換しない', () => {
  const [note] = parseEnex(
    enex(`<note><title>1996.10</title><content>${enml('<div>本文</div>')}</content></note>`),
  )
  expect(note.title).toBe('1996.10')
})

// 捨てるだけにすると、レポートに出ないまま添付が消える。理由を持って上へ運ぶ
test('base64 でない添付は理由つきで弾く', () => {
  const [note] = parseEnex(
    enex(`
      <note>
        <title>素のノート</title>
        <content>${enml('<div>本文</div>')}</content>
        <resource>
          <data encoding="hex">deadbeef</data>
          <mime>image/png</mime>
          <resource-attributes><file-name>壊れた.png</file-name></resource-attributes>
        </resource>
      </note>`),
  )
  expect(note.resources).toEqual([])
  expect(note.rejectedResources).toEqual([
    {
      fileName: '壊れた.png',
      mime: 'image/png',
      reason: 'base64 以外の形式で埋め込まれています (hex)',
    },
  ])
})

test('中身が空の添付も理由つきで弾く', () => {
  const [note] = parseEnex(
    enex(`
      <note>
        <content>${enml('<div>本文</div>')}</content>
        <resource><data encoding="base64"></data><mime>image/png</mime></resource>
      </note>`),
  )
  expect(note.rejectedResources[0].reason).toBe('中身が空です')
})

test('読めた添付は rejectedResources に入らない', () => {
  const [note] = parseEnex(enex(fullNote))
  expect(note.rejectedResources).toEqual([])
})

// 実物の Evernote 書き出しは属性を持つので object になるが、
// 手で作った空ファイルは空文字で返ってくる。0 件として扱う
test('ノートが 1 件も無い ENEX は空配列', () => {
  expect(parseEnex('<?xml version="1.0"?><en-export></en-export>')).toEqual([])
  expect(parseEnex(enex(''))).toEqual([])
})

// UTF-8 として復号済みの文字列が渡ってくるので、別の符号化を名乗るファイルは
// 既に化けている。黙って文字化けしたノートを作るより断る
test('UTF-8 以外を名乗るファイルは例外', () => {
  const shiftJis = `<?xml version="1.0" encoding="Shift_JIS"?><en-export><note/></en-export>`
  expect(() => parseEnex(shiftJis)).toThrow(/UTF-8/)
})

test('XML として壊れていれば例外', () => {
  expect(() => parseEnex('<en-export><note>')).toThrow()
})

test('en-export でなければ例外', () => {
  expect(() => parseEnex('<?xml version="1.0"?><rss><channel/></rss>')).toThrow(
    /ENEX/,
  )
})

// 外部実体参照 (XXE)。fast-xml-parser が拒む挙動をここで固定しておく
test('外部実体参照を含む XML は取り込まない', () => {
  const attack = `<?xml version="1.0"?>
<!DOCTYPE en-export [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<en-export><note><title>&xxe;</title></note></en-export>`
  expect(() => parseEnex(attack)).toThrow()
})
