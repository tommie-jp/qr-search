// 一括タグ操作の UI / アクションで使う純関数 (DB 非依存)。
// タグの抽出・正規化は tags.ts に委ね、ここは「入力の解釈」と
// 「選択アイテムのタグ集計」だけを担う。

import { buildSearchUrl } from './searchUrl'
import { parseTagToken } from './tags'
import { isValidItemNo, parseSort } from './validation'

// 1 回の一括操作で処理する最大アイテム数 (選択はページ内=最大 20 件だが、
// 細工されたフォームに備えてループを有界にする)。
const MAX_BULK_ITEMS = 100

// タグ入力の上限。itemNo と同様、細工された巨大入力で 1 回の操作が
// item 数 × タグ数の重い処理にならないよう有界にする。
const MAX_INPUT_LENGTH = 1000
const MAX_TAGS = 50

// タグ入力欄 (空白区切り) を正規化済みタグ名の配列にする。
// `#` は付けても付けなくてもよい。タグにならないトークンは捨て、重複は初出順で除く。
export function parseTagInput(input: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const token of input.slice(0, MAX_INPUT_LENGTH).split(/\s+/)) {
    if (!token) {
      continue
    }
    const withHash = /^[#＃]/.test(token) ? token : `#${token}`
    const name = parseTagToken(withHash)
    // 正規化後の名前が再びタグとして読めるものだけ採用する。NFKC 展開で
    // タグに使えない文字になる入力 (⑴ → (1)、½ → 1⁄2 など) は書いても
    // extractTags が拾えず二重登録の元になるため弾く。
    if (name && parseTagToken(`#${name}`) === name && !seen.has(name)) {
      seen.add(name)
      tags.push(name)
      if (tags.length >= MAX_TAGS) {
        break
      }
    }
  }
  return tags
}

// 削除チップ用に、選択したアイテムが持つタグの和集合 (タグ名昇順・重複なし) を返す。
export function selectedTagsUnion(
  items: ReadonlyArray<{ itemNo: string; tags: string[] }>,
  selected: Iterable<string>,
): string[] {
  const selectedSet = new Set(selected)
  const union = new Set<string>()
  for (const item of items) {
    if (selectedSet.has(item.itemNo)) {
      for (const tag of item.tags) {
        union.add(tag)
      }
    }
  }
  return [...union].sort()
}

export interface BulkTagRequest {
  mode: 'add' | 'remove'
  itemNos: string[] // 検証済み・重複除去済み
  tags: string[] // 正規化済み
  back: string // 操作後に戻る一覧 URL
}

// 一括操作フォームの内容を解釈する (DB 非依存なので単体テストできる)。
// 押されたボタンで add / remove を判別する:
//   - 削除チップ (name="removeTag") が来ていれば remove、その値が対象タグ。
//   - それ以外は add で、addTags 入力欄 (空白区切り) を対象タグにする。
export function parseBulkTagForm(formData: FormData): BulkTagRequest {
  const removeTag = formData.get('removeTag')
  const isRemove = typeof removeTag === 'string' && removeTag.length > 0
  const rawTags = isRemove ? removeTag : String(formData.get('addTags') ?? '')

  const seen = new Set<string>()
  const itemNos: string[] = []
  for (const value of formData.getAll('itemNo')) {
    if (typeof value !== 'string' || !isValidItemNo(value) || seen.has(value)) {
      continue
    }
    seen.add(value)
    itemNos.push(value)
    if (itemNos.length >= MAX_BULK_ITEMS) {
      break
    }
  }

  const page = Number(formData.get('page')) || 1
  const back = buildSearchUrl(
    String(formData.get('q') ?? ''),
    page,
    parseSort(formData.get('sort')),
  )

  return { mode: isRemove ? 'remove' : 'add', itemNos, tags: parseTagInput(rawTags), back }
}
