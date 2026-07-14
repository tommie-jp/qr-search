import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { Item } from '@/generated/prisma/client'
import { parseSearchQuery } from '@/lib/search'
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

// 検索語 1 語ぶんの WHERE 条件を組み立てる。
// memo / url は PGroonga の全文一致 (&@, 日本語バイグラム・全半角/大小の正規化つき)、
// itemNo は現行どおり前方一致 (ILIKE, 旧データの英字入り itemNo に備え大小無視)。
function termCondition(term: string): Prisma.Sql {
  const likePrefix = `${escapeLike(term)}%`
  return Prisma.sql`(memo &@ ${term} OR url &@ ${term} OR item_no ILIKE ${likePrefix})`
}

// 検索クエリを DNF (AND グループの OR) に解析して WHERE 句を組み立てる。
// グループ内は各語を AND、グループ間は OR で結合する。
//   `抵抗 1608 OR コンデンサ`
//     → WHERE ((抵抗) AND (1608)) OR ((コンデンサ))
// 空クエリなら WHERE を付けない (一覧ブラウズ)。
function buildWhere(query: string): Prisma.Sql {
  const groups = parseSearchQuery(query)
  if (groups.length === 0) {
    return Prisma.empty
  }
  const groupSql = groups.map(
    (terms) =>
      Prisma.sql`(${Prisma.join(terms.map(termCondition), ' AND ')})`,
  )
  return Prisma.sql`WHERE ${Prisma.join(groupSql, ' OR ')}`
}

// ソート句。PGroonga のスコアは小テーブルで seq scan になり効かないため、
// 関連度順は採用せず現行の更新順/番号順を維持する (docs/04-全文検索計画.md §3-4)。
function buildOrderBy(sort: Sort): Prisma.Sql {
  return sort === 'updated'
    ? Prisma.sql`ORDER BY updated_at DESC`
    : Prisma.sql`ORDER BY item_no_num ASC NULLS LAST, item_no ASC`
}

// q は memo / url の全文検索 (&@)、または itemNo の前方一致。
// 空白 (半角/全角) 区切りは AND、"OR"/"|" は OR (DNF)。文法は search.ts 参照。
export async function searchItems(
  query: string,
  page: number,
  sort: Sort = 'updated',
): Promise<ItemSearchResult> {
  const where = buildWhere(query)

  const totalRows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM items ${where}
  `
  const total = totalRows[0]?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), pageCount)
  const offset = (safePage - 1) * PAGE_SIZE

  // 列は camelCase へ射影し既存の Item 型に合わせる (findMany と同じ形)。
  const items = await prisma.$queryRaw<Item[]>`
    SELECT item_no    AS "itemNo",
           item_no_num AS "itemNoNum",
           memo,
           url,
           mode,
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM items
    ${where}
    ${buildOrderBy(sort)}
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `

  return { items, total, page: safePage, pageCount }
}
