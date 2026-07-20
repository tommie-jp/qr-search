// 検索結果で選択したノートに対する一括操作フォームの共通部分 (DB 非依存)。
// 一括タグ (bulkTags.ts) とゴミ箱行き (actions.ts の trashItemsAction) が
// 同じ形のフォーム (itemNo[] + q/page/sort) を送るため、解釈をここに集約する。

import { buildSearchUrl } from './searchUrl'
import { isValidItemNo, parseSort } from './validation'

// 1 回の一括操作で処理する最大アイテム数。オンデマンド表示 (docs/33) で
// 選択は読み込んだ全件に及ぶようになったため、全ノート規模 (数百〜数千)
// を上限にする。細工されたフォームに備えてループを有界にする意図は同じ。
const MAX_BULK_ITEMS = 5000

// チェックされた itemNo を検証済み・重複なしで返す (フォームの並び順)。
export function parseSelectedItemNos(formData: FormData): string[] {
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
  return itemNos
}

// 操作後に戻る一覧 URL。検索状態 (q/page/sort) から**必ずここで組み立てる**。
// フォームの値をそのまま redirect 先にするとオープンリダイレクトになるため、
// 戻り先の形は buildSearchUrl の `/?q=…` に限定する。
export function parseBackUrl(formData: FormData): string {
  const page = Number(formData.get('page')) || 1
  return buildSearchUrl(
    String(formData.get('q') ?? ''),
    page,
    parseSort(formData.get('sort')),
  )
}
