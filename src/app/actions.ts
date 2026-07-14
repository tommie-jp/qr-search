'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { upsertItem, upsertMemo } from '@/lib/items'
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

// Ver1 の /item/:itemNo POST 相当: memo だけをその場で更新 (未登録なら作成)
export async function updateMemoAction(formData: FormData): Promise<void> {
  const itemNo = readItemNo(formData)
  const memo = readText(formData, 'memo')
  await upsertMemo(itemNo, memo)
  revalidatePath(`/item/${itemNo}`)
  redirect(`/item/${itemNo}`)
}

// Ver1 の /edit/:itemNo POST 相当: mode / memo / url を更新 (未登録なら作成)
export async function updateItemAction(formData: FormData): Promise<void> {
  const itemNo = readItemNo(formData)
  const memo = readText(formData, 'memo')
  const url = readText(formData, 'url')
  const mode = parseMode(formData.get('mode'))
  await upsertItem(itemNo, { memo, url, mode })
  revalidatePath(`/item/${itemNo}`)
  redirect(`/item/${itemNo}`)
}
