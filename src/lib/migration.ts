import { itemNoToNum, parseMode, type Mode } from '@/lib/validation'

// mongoexport (Ver1 の item コレクション) の 1 ドキュメント
export interface Ver1ItemDoc {
  itemNo: string | number
  memo?: string
  url?: string
  mode?: string
  createdAt?: { $date: string }
  updatedAt?: { $date: string }
}

export interface MigrationItem {
  itemNo: string
  itemNoNum: number | null
  memo: string
  url: string
  mode: Mode
  createdAt: Date
  updatedAt: Date
}

function parseDate(value: { $date: string } | undefined): Date | null {
  if (!value?.$date) {
    return null
  }
  const date = new Date(value.$date)
  return Number.isNaN(date.getTime()) ? null : date
}

export function transformVer1Item(doc: Ver1ItemDoc): MigrationItem {
  const itemNo = String(doc.itemNo)
  const createdAt = parseDate(doc.createdAt)
  const updatedAt = parseDate(doc.updatedAt)
  return {
    itemNo,
    itemNoNum: itemNoToNum(itemNo),
    memo: doc.memo ?? '',
    url: doc.url ?? '',
    mode: parseMode(doc.mode),
    createdAt: createdAt ?? updatedAt ?? new Date(),
    updatedAt: updatedAt ?? createdAt ?? new Date(),
  }
}

// Ver1 のバグで同じ番号の number 版 / string 版が共存する。
// Ver1 (Waterline) は integer キャストで検索するため number 版が
// 実際に表示されていた → number 版を正とする。
// 同型どうしの重複は updatedAt が新しい方を採用する。
function isBetterDoc(candidate: Ver1ItemDoc, current: Ver1ItemDoc): boolean {
  const candidateIsNumber = typeof candidate.itemNo === 'number'
  const currentIsNumber = typeof current.itemNo === 'number'
  if (candidateIsNumber !== currentIsNumber) {
    return candidateIsNumber
  }
  const candidateUpdated = parseDate(candidate.updatedAt)?.getTime() ?? 0
  const currentUpdated = parseDate(current.updatedAt)?.getTime() ?? 0
  return candidateUpdated > currentUpdated
}

export interface DedupeResult {
  winners: Ver1ItemDoc[]
  skipped: Ver1ItemDoc[]
}

export function dedupeVer1Items(docs: Ver1ItemDoc[]): DedupeResult {
  const winnersByItemNo = new Map<string, Ver1ItemDoc>()
  const skipped: Ver1ItemDoc[] = []

  for (const doc of docs) {
    const key = String(doc.itemNo)
    const current = winnersByItemNo.get(key)
    if (!current) {
      winnersByItemNo.set(key, doc)
    } else if (isBetterDoc(doc, current)) {
      skipped.push(current)
      winnersByItemNo.set(key, doc)
    } else {
      skipped.push(doc)
    }
  }

  return { winners: [...winnersByItemNo.values()], skipped }
}
