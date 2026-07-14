import { prisma } from '@/lib/db'
import type { Item } from '@/generated/prisma/client'
import {
  escapeLike,
  itemNoToNum,
  type Mode,
  type Sort,
} from '@/lib/validation'

export const PAGE_SIZE = 20

export async function getItem(itemNo: string): Promise<Item | null> {
  return prisma.item.findUnique({ where: { itemNo } })
}

// Ver1 の /item/:itemNo と同じく、未登録なら新規作成する (upsert)
export async function upsertMemo(itemNo: string, memo: string): Promise<Item> {
  return prisma.item.upsert({
    where: { itemNo },
    update: { memo },
    create: { itemNo, itemNoNum: itemNoToNum(itemNo), memo },
  })
}

export async function upsertItem(
  itemNo: string,
  data: { memo: string; url: string; mode: Mode },
): Promise<Item> {
  return prisma.item.upsert({
    where: { itemNo },
    update: data,
    create: { itemNo, itemNoNum: itemNoToNum(itemNo), ...data },
  })
}

export interface ItemSearchResult {
  items: Item[]
  total: number
  page: number
  pageCount: number
}

// q は itemNo の前方一致、または memo / url の部分一致 (大文字小文字無視)
export async function searchItems(
  query: string,
  page: number,
  sort: Sort = 'itemNo',
): Promise<ItemSearchResult> {
  const escaped = escapeLike(query)
  const where = query
    ? {
        OR: [
          // 大文字小文字無視: 旧データに "100x" のような英字入り itemNo がある
          { itemNo: { startsWith: escaped, mode: 'insensitive' as const } },
          { memo: { contains: escaped, mode: 'insensitive' as const } },
          { url: { contains: escaped, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const total = await prisma.item.count({ where })
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), pageCount)

  const orderBy =
    sort === 'updated'
      ? [{ updatedAt: 'desc' as const }]
      : [
          { itemNoNum: { sort: 'asc' as const, nulls: 'last' as const } },
          { itemNo: 'asc' as const },
        ]

  const items = await prisma.item.findMany({
    where,
    orderBy,
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  })

  return { items, total, page: safePage, pageCount }
}
