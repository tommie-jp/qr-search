// ENML (Evernote のノート本文) を Markdown へ変換する
// (設計は docs/28-エクスポート計画.md §4)。
//
// 変換そのものは **turndown** に任せる。HTML → Markdown の実質の標準で、
// Evernote 移行ツール (yarle など) が軒並み採用している = ENEX が吐く
// 実際の HTML に対する実績がある。ここで書くのは ENML 固有のタグ
// (en-media / en-todo / en-crypt) と、このアプリの memo 記法に合わせる差分だけ。
//
// フォント・文字サイズは**捨てる**のが仕様 (memo は Markdown なので持てない)。
// turndown は span/font の殻を落として中身だけ残すため、既定の挙動がそのまま
// 要件に一致する (テストで固定してある)。

import domino from '@mixmark-io/domino'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export interface EnexMedia {
  // 保存後の参照先 (/api/images/<uuid>.<ext>)
  url: string
  // 画像なら ![](url)、音声や PDF はリンクにする。memo 側の表示は
  // 拡張子で振り分かれるので、記法だけ変えれば再生・表示まで既存の経路に乗る
  isImage: boolean
  // リンクにするときの文字。元のファイル名を想定
  label: string
}

// 取り込めなかったものは、本文から黙って消さずに跡を残す。消してしまうと
// 本文だけを見て「元から無かった」と読めてしまい、レポートと突き合わせられない
const MISSING_MEDIA = '(添付ファイルを取り込めませんでした)'
const ENCRYPTED = '(暗号化された部分は取り込めませんでした)'

export interface EnmlConversion {
  markdown: string
  // 本文が参照しているのに media に無かった添付の hash。**本文の跡だけでなく
  // ここでも返す**のが要点で、呼び出し側はこれをレポートへ載せる。本文を
  // 目視しないと気づけない欠落は、無かったことにされるのと大差ない
  missingHashes: string[]
  // <en-crypt> の数。端末の鍵でしか開けないので取り込みようがないが、
  // 「何かが落ちた」ことは伝える
  encryptedCount: number
}

// 変換の途中で見つけた「取り込めなかったもの」を溜める器。
// turndown のルールは値を返すことしかできないので、外側に置いて書き込む
interface Losses {
  missingHashes: string[]
  encryptedCount: number
}

function createTurndown(
  media: ReadonlyMap<string, EnexMedia>,
  losses: Losses,
): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })

  // 表・取り消し線・チェックボックス (GFM)。このアプリの表示も remark-gfm なので
  // 記法を揃えられる
  turndown.use(gfm)

  // 中身ごと落とすもの。turndown の既定は「殻を剥がして中身を残す」なので、
  // script/style は明示的に消さないと本文へ CSS や JS が文字として流れ込む
  turndown.remove(['script', 'style', 'head', 'title'])

  // Evernote は 1 行を 1 つの div で包む。turndown の既定 (未知のブロック要素)
  // では前後に空行が入り、行間が倍に開いた読みにくい memo になる。
  // このアプリの表示は remark-breaks で単独改行を <br> にするため、
  // 改行 1 つで元の見た目どおりに出る。
  //
  // **表のセルの中だけは改行を入れない**。Evernote はセルの中身も div で包むが、
  // GFM の表は 1 行が 1 レコードなので、改行を入れると表が崩れる
  // (実測: `| 型番 |` が 3 行に割れた)
  turndown.addRule('enmlDiv', {
    filter: 'div',
    replacement: (content, node) =>
      isInsideTableCell(node) ? content : `\n${content}\n`,
  })

  // 取り消し線。gfm プラグインは `~` 1 つで出すが、GFM を厳密に読む処理系
  // (Obsidian など) は `~~` しか認めない。エクスポートした memo を他所で
  // 開くことを想定している (docs/28 §1) ので 2 つで書く
  turndown.addRule('strikethrough', {
    filter: ['del', 's'],
    replacement: (content) => `~~${content}~~`,
  })

  // <en-media hash="..."/> … 本文からの添付参照。保存済みの URL へ差し替える。
  // HTML パーサへ渡す前に <img data-enex-hash> へ置き換えてある
  // (normalizeEnmlVoids のコメント参照)
  turndown.addRule('enMedia', {
    filter: (node) => node.getAttribute?.(MEDIA_ATTR) !== null,
    replacement: (_content, node) => {
      const hash = (node as Element).getAttribute(MEDIA_ATTR) ?? ''
      const found = media.get(hash)
      if (!found) {
        if (!losses.missingHashes.includes(hash)) {
          losses.missingHashes.push(hash)
        }
        return MISSING_MEDIA
      }
      return found.isImage
        ? `![](${found.url})`
        : `[${escapeLinkText(found.label)}](${found.url})`
    },
  })

  // <en-todo checked="true"/> … チェックボックス。ENML では行頭に置かれた
  // 空要素なので、GFM のチェックボックス記法を行頭へ書き出す
  turndown.addRule('enTodo', {
    filter: (node) => node.getAttribute?.(TODO_ATTR) !== null,
    replacement: (_content, node) =>
      (node as Element).getAttribute(TODO_ATTR) === 'checked'
        ? '- [x] '
        : '- [ ] ',
  })

  // <en-crypt> … 端末側の鍵でしか開けない。中身 (暗号文) を本文に流しても
  // 意味が無いので跡だけ残す
  turndown.addRule('enCrypt', {
    filter: (node) => node.nodeName.toLowerCase() === 'en-crypt',
    replacement: () => {
      losses.encryptedCount += 1
      return ENCRYPTED
    },
  })

  return turndown
}

// ENML の殻。turndown へ渡す前に落とす。
// <en-note> 自体は未知のブロック要素として素通しされるが、XML 宣言と DOCTYPE は
// HTML パーサに渡すと解釈が処理系任せになるため、こちらで確実に消しておく
const XML_PROLOG = /^\s*<\?xml[^>]*\?>\s*/i
const DOCTYPE = /^\s*<!DOCTYPE[^>]*>\s*/i

function stripEnmlWrapper(enml: string): string {
  return enml.replace(XML_PROLOG, '').replace(DOCTYPE, '')
}

// --- ENML 固有の空要素を HTML の空要素へ寄せる ---
//
// ENML は XHTML なので `<en-media …/>` と自分で閉じるが、turndown が使う
// HTML パーサ (domino) は **HTML の規則で読む**。HTML には自己終了タグが無く、
// 未知のタグは「開いたまま」になるため、`<en-media/>` が後続の本文を丸ごと
// 子として飲み込んでしまう (実測: チェックボックス直後の文字が消えた)。
//
// そこで、置換先に **HTML が空要素と決めているタグ** (img / input) を使い、
// 元の情報は data 属性で運ぶ。パーサに「ここで閉じている」と判らせるのが要点で、
// タグ名を変えること自体に意味はない。
const MEDIA_ATTR = 'data-enex-hash'
const TODO_ATTR = 'data-enex-todo'

// 属性値へ流し込む前に、記号を落として英数字だけにする。hash は 16 進の
// md5 なのでこれで欠けることはなく、引用符を閉じて属性を捏造する余地を断てる
function safeAttrValue(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 64)
}

// 表のセルの中か。turndown のルールは DOM ノードを受け取るので、親を辿って見る
// (closest() は domino の版によっては無いので使わない)
function isInsideTableCell(node: Node): boolean {
  for (let at = node.parentNode; at; at = at.parentNode) {
    const name = at.nodeName.toLowerCase()
    if (name === 'td' || name === 'th') {
      return true
    }
    if (name === 'table' || name === 'body') {
      return false
    }
  }
  return false
}

// リンクの表示文字に使う前に、Markdown の記号を殺す。
//
// 表示文字の出どころは ENEX の `<file-name>` = **ファイルの作者が自由に書ける**。
// `資料.pdf](https://evil.example "click")[` のような名前をそのまま挟むと、
// 意図したリンクを途中で閉じて別のリンクを 1 つ差し込める (偽装リンク)。
// 表示は rehype-sanitize を通るので javascript: は消えるが、http(s) の
// 偽装先までは止まらないので、記法そのものを壊せないようにする。
// 改行も落とす — リンクの表示文字は 1 行でなければ記法が崩れる
function escapeLinkText(label: string): string {
  return label.replace(/[\\[\]()]/g, '\\$&').replace(/[\r\n]+/g, ' ')
}

// --- 表の見出し行 ---
//
// turndown-plugin-gfm は「見出し行がある表」しか Markdown にしない。
// 無い表は `keep` されて **生 HTML のまま**残り、このアプリの表示
// (react-markdown、生 HTML 無効) では**何も描かれない**。
// ところが Evernote の表は `<td>` だけで `<th>` を使わないため、実物の
// ENEX はまるごとこの穴に落ちる (実測: td だけの表が丸ごと消えた)。
//
// プラグインを避けて自前で表を組むより、**入力を寄せて既存の実装に乗せる**。
// 1 行目のセルを th にすれば isHeadingRow() が真になり、あとはプラグインが
// 変換してくれる。副次的に、表の中の <en-media> も (keep されなくなるので)
// ちゃんと画像記法へ変換される。
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

function promoteTableHeaders(doc: Document): void {
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    // 木の前順走査なので、入れ子の表があっても外側の 1 行目が先に当たる。
    // **真偽で見る** — domino の querySelector は見つからないとき null ではなく
    // undefined を返すため、`!== null` で書くと全部の表を素通りしてしまう
    const firstRow = table.querySelector('tr')
    if (!firstRow || firstRow.querySelector('th')) {
      continue // 既に見出し行がある表はそのまま
    }
    for (const cell of Array.from(firstRow.children)) {
      if (cell.tagName.toLowerCase() !== 'td') {
        continue
      }
      const heading = doc.createElement('th')
      // 属性ごと移し替える (colspan などを落とさない)
      for (const attr of Array.from(cell.attributes)) {
        heading.setAttribute(attr.name, attr.value)
      }
      while (cell.firstChild) {
        heading.appendChild(cell.firstChild)
      }
      cell.replaceWith(heading)
    }
  }
}

function normalizeEnmlVoids(enml: string): string {
  return enml
    .replace(/<en-media\b([^>]*)>/gi, (_match, attrs: string) => {
      const hash = /hash\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? ''
      return `<img ${MEDIA_ATTR}="${safeAttrValue(hash)}">`
    })
    .replace(/<\/en-media\s*>/gi, '')
    .replace(/<en-todo\b([^>]*)>/gi, (_match, attrs: string) => {
      const checked = /checked\s*=\s*["']?true/i.test(attrs)
      return `<input ${TODO_ATTR}="${checked ? 'checked' : 'open'}">`
    })
    .replace(/<\/en-todo\s*>/gi, '')
}

// ENML を Markdown にする。media は「添付の md5 → 保存後の参照先」。
//
// 対応する添付が無い <en-media> と <en-crypt> は、本文に跡を残す**と同時に**
// 戻り値でも数え上げる。呼び出し側 (importEnex.ts) がレポートへ載せるため。
export function enmlToMarkdown(
  enml: string,
  media: ReadonlyMap<string, EnexMedia>,
): EnmlConversion {
  const losses: Losses = { missingHashes: [], encryptedCount: 0 }
  const body = normalizeEnmlVoids(stripEnmlWrapper(enml))
  if (body.trim() === '') {
    return { markdown: '', ...losses }
  }

  // 自分で組み立てた DOM を渡す。表の見出し行を足すために木を触る必要があり、
  // turndown に文字列を渡すと同じ木を内部でもう一度作ることになる。
  // パーサは turndown が使っているものと同じ domino なので解釈はずれない
  const doc = domino.createDocument(body, true)
  promoteTableHeaders(doc)

  return {
    markdown: createTurndown(media, losses).turndown(doc.body).trim(),
    ...losses,
  }
}

// --- 変換にかけてよい入力か ---
//
// turndown (と domino) は木を**再帰で**歩く。`<div>` を延々と入れ子にした
// ENML を渡すと、変換が終わらないどころか失敗するまでに数十秒の同期処理を
// 回す (実測: 660KB / 6 万段で 23.5 秒)。Node は 1 本のイベントループなので、
// その間このアプリ全体が止まる。**変換する前に**断るしかない。
//
// 上限は「本物のノートなら絶対に届かない」ところに置く。memo 自体が
// 10000 字までなので、これを超える ENML はどのみち取り込めない
export const MAX_ENML_BYTES = 512 * 1024
export const MAX_ENML_DEPTH = 200

const TAG = /<(\/?)([a-zA-Z][^\s/>]*)([^>]*)>/g

// タグの入れ子の深さを 1 回の走査で数える (木は作らない)。
// 閉じ忘れ・閉じすぎのある壊れた HTML でも止まらないことだけを保証すればよく、
// 正確な木の高さである必要はない
function maxTagDepth(html: string): number {
  let depth = 0
  let max = 0
  for (const match of html.matchAll(TAG)) {
    const isClosing = match[1] === '/'
    const isSelfClosing = match[3].endsWith('/')
    if (isClosing) {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (isSelfClosing || VOID_TAGS.has(match[2].toLowerCase())) {
      continue
    }
    depth += 1
    max = Math.max(max, depth)
  }
  return max
}

// 変換を断る理由 (問題なければ null)。呼び出し側はこれをレポートへ載せる。
export function enmlRejectReason(enml: string): string | null {
  // 深さを数える前に大きさで断る。走査そのものを細工した入力で長引かせない
  const bytes = Buffer.byteLength(enml, 'utf8')
  if (bytes > MAX_ENML_BYTES) {
    return `本文が大きすぎます (${Math.round(bytes / 1024)}KB / 上限 ${MAX_ENML_BYTES / 1024}KB)`
  }
  const depth = maxTagDepth(enml)
  if (depth > MAX_ENML_DEPTH) {
    return `本文の入れ子が深すぎます (${depth} 段 / 上限 ${MAX_ENML_DEPTH} 段)`
  }
  return null
}
