'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { parseBulkTagForm } from '@/lib/bulkTags'
import {
  emptyTrash,
  getItem,
  purgeItems,
  restoreItems,
  trashItems,
  upsertItem,
  upsertMemo,
} from '@/lib/items'
import { parseBackUrl, parseSelectedItemNos } from '@/lib/itemSelection'
import { addTagsToMemo, removeTagsFromMemo } from '@/lib/tagEdit'
import { isValidItemNo, parseMode } from '@/lib/validation'

const MAX_TEXT_LENGTH = 10000

function readText(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value !== 'string') {
    return ''
  }
  if (value.length > MAX_TEXT_LENGTH) {
    throw new Error(`${key} が長すぎます (最大 ${MAX_TEXT_LENGTH} 文字)`)
  }
  return value
}

function readItemNo(formData: FormData): string {
  const itemNo = String(formData.get('itemNo') ?? '')
  if (!isValidItemNo(itemNo)) {
    throw new Error('itemNo が不正です')
  }
  return itemNo
}

// 保存後の「保存しました」トースト用の戻り先 (docs/11-アプリ的UIUX計画.md §2-3)。
// 値を時刻にするのは、連続保存でも毎回トーストを出すため (SavedToast の key に
// 使う)。印はトーストを出した直後にクライアントが URL から消す
function savedHref(itemNo: string): string {
  return `/item/${itemNo}?saved=${Date.now()}`
}

// Ver1 の /item/:itemNo POST 相当: memo だけをその場で更新 (未登録なら作成)
export async function updateMemoAction(formData: FormData): Promise<void> {
  const itemNo = readItemNo(formData)
  const memo = readText(formData, 'memo')
  await upsertMemo(itemNo, memo)
  revalidatePath(`/item/${itemNo}`)
  redirect(savedHref(itemNo))
}

// Ver1 の /edit/:itemNo POST 相当: mode / memo / url を更新 (未登録なら作成)
export async function updateItemAction(formData: FormData): Promise<void> {
  const itemNo = readItemNo(formData)
  const memo = readText(formData, 'memo')
  const url = readText(formData, 'url')
  const mode = parseMode(formData.get('mode'))
  await upsertItem(itemNo, { memo, url, mode })
  revalidatePath(`/item/${itemNo}`)
  redirect(savedHref(itemNo))
}

// --- ゴミ箱 (二段階削除。docs/12-ゴミ箱計画.md) ---

// 検索結果で選択したノートをゴミ箱へ入れる (復元できるので confirm は出さない)。
// 一括タグと同じフォームから formAction で分岐して呼ばれる。
export async function trashItemsAction(formData: FormData): Promise<void> {
  const itemNos = parseSelectedItemNos(formData)
  const back = parseBackUrl(formData)

  if (itemNos.length > 0) {
    await trashItems(itemNos)
    revalidatePath('/')
    revalidatePath('/trash')
  }

  redirect(back)
}

// ゴミ箱から戻す。/trash の「復元」と /item のバナーの両方から呼ばれ、
// どちらも同じルートを revalidate すれば呼び出し元がそのまま描き直される
// (Next.js は revalidatePath で現在のルートを再レンダリングして返す)。
export async function restoreItemsAction(formData: FormData): Promise<void> {
  const itemNos = parseSelectedItemNos(formData)
  if (itemNos.length === 0) {
    return
  }

  await restoreItems(itemNos)
  revalidatePath('/')
  revalidatePath('/trash')
  for (const itemNo of itemNos) {
    revalidatePath(`/item/${itemNo}`)
  }
}

// 永久削除。ゴミ箱にある行しか消せないことは items.ts の purgeItems が保証する
// (UI の confirm は最後の一押しで、防護そのものではない)。
export async function purgeItemsAction(formData: FormData): Promise<void> {
  const itemNos = parseSelectedItemNos(formData)
  if (itemNos.length === 0) {
    return
  }

  await purgeItems(itemNos)
  revalidatePath('/')
  revalidatePath('/trash')
}

export async function emptyTrashAction(): Promise<void> {
  await emptyTrash()
  revalidatePath('/')
  revalidatePath('/trash')
}

// 検索結果で選択した複数ノートへ、タグをまとめて追加/削除する。
// タグの正本はメモ本文なので、本文を書き換えて upsertMemo で保存し
// items.tags を再計算させる (tagEdit.ts 参照)。実際に本文が変わったノートだけ
// 保存するので、文章中にしかないタグの削除など「効かない」操作では更新しない。
export async function bulkTagAction(formData: FormData): Promise<void> {
  const { mode, itemNos, tags, back } = parseBulkTagForm(formData)

  if (itemNos.length > 0 && tags.length > 0) {
    for (const itemNo of itemNos) {
      const item = await getItem(itemNo)
      const memo = item?.memo ?? ''
      const next =
        mode === 'add'
          ? addTagsToMemo(memo, tags)
          : removeTagsFromMemo(memo, tags)
      if (next !== memo) {
        await upsertMemo(itemNo, next)
      }
    }
    revalidatePath('/')
  }

  redirect(back)
}
