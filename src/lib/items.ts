import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { Item } from '@/generated/prisma/client'
import { memoSummary } from '@/lib/memoSummary'
import {
  extractProps,
  parseStoredProps,
  type ItemPropsRow,
} from '@/lib/props'
import { parseSearchQuery, type SearchTerm } from '@/lib/search'
import { extractTags } from '@/lib/tags'
import {
  escapeLike,
  itemNoToNum,
  type Mode,
  type Sort,
} from '@/lib/validation'

export const PAGE_SIZE = 20

// 特性表に載せるノート数の上限。一覧のページ送り (PAGE_SIZE) とは独立で、
// ページを開いても表は検索ヒット全体で一定になるようにする。
// 個人利用で 1 タグに数百件も付かない前提の安全弁。
export const PROPS_TABLE_LIMIT = 200

export async function getItem(itemNo: string): Promise<Item | null> {
  return prisma.item.findUnique({ where: { itemNo } })
}

// Ver1 の /item/:itemNo と同じく、未登録なら新規作成する (upsert)。
// tags / props は memo から抽出した派生キャッシュ (保存のたびに再計算する)。
export async function upsertMemo(itemNo: string, memo: string): Promise<Item> {
  const derived = derivedFromMemo(memo)
  return prisma.item.upsert({
    where: { itemNo },
    update: { memo, ...derived },
    create: { itemNo, itemNoNum: itemNoToNum(itemNo), memo, ...derived },
  })
}

export async function upsertItem(
  itemNo: string,
  data: { memo: string; url: string; mode: Mode },
): Promise<Item> {
  const derived = derivedFromMemo(data.memo)
  return prisma.item.upsert({
    where: { itemNo },
    update: { ...data, ...derived },
    create: { itemNo, itemNoNum: itemNoToNum(itemNo), ...data, ...derived },
  })
}

// memo 由来の派生キャッシュ列。正本は memo なので保存のたびに丸ごと作り直す。
// 書き込み経路 (upsertMemo / upsertItem) を 1 箇所に集約して、再計算漏れを防ぐ。
function derivedFromMemo(memo: string) {
  return {
    tags: extractTags(memo),
    props: extractProps(memo),
  }
}

export interface TagCount {
  tag: string
  count: number
}

// 全ノートのタグを件数つきで集計する (件数降順・同数はタグ名昇順)。
// 検索窓のタグ補完・タグ一覧に使う。個人利用でタグ総数は小さい前提。
export async function listTags(): Promise<TagCount[]> {
  return prisma.$queryRaw<TagCount[]>`
    SELECT tag, count(*)::int AS count
    FROM (SELECT unnest(tags) AS tag FROM items) AS t
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `
}

export interface ItemSearchResult {
  items: Item[]
  total: number
  page: number
  pageCount: number
}

// 検索語 1 語ぶんの WHERE 条件を組み立てる。
// text: memo / url は PGroonga の全文一致 (&@, 日本語バイグラム・全半角/大小の
//   正規化つき)、itemNo は前方一致 (ILIKE, 旧データの英字入り itemNo に備え大小無視)。
// tag: items.tags 配列の完全一致 (@>, GIN インデックスが効く)。
//   タグ名は search.ts が正規化済み (NFKC + 小文字化)。
function termCondition(term: SearchTerm): Prisma.Sql {
  if (term.kind === 'tag') {
    return Prisma.sql`tags @> ARRAY[${term.value}]::text[]`
  }
  const likePrefix = `${escapeLike(term.value)}%`
  return Prisma.sql`(memo &@ ${term.value} OR url &@ ${term.value} OR item_no ILIKE ${likePrefix})`
}

// 検索クエリを DNF (AND グループの OR) の条件式へ組み立てる (WHERE は付けない)。
// グループ内は各語を AND、グループ間は OR で結合する。
//   `抵抗 1608 OR コンデンサ` → ((抵抗) AND (1608)) OR ((コンデンサ))
// 空クエリ (絞り込みなし) なら null。
function buildQueryCondition(query: string): Prisma.Sql | null {
  const groups = parseSearchQuery(query)
  if (groups.length === 0) {
    return null
  }
  const groupSql = groups.map(
    (terms) =>
      Prisma.sql`(${Prisma.join(terms.map(termCondition), ' AND ')})`,
  )
  return Prisma.join(groupSql, ' OR ')
}

// 検索の WHERE 句。空クエリなら WHERE を付けない (一覧ブラウズ)。
function buildWhere(query: string): Prisma.Sql {
  const condition = buildQueryCondition(query)
  return condition === null ? Prisma.empty : Prisma.sql`WHERE ${condition}`
}

// 特性表の WHERE 句。検索条件に加えてプロパティを持つノートだけへ絞る。
function buildPropsWhere(query: string): Prisma.Sql {
  const condition = buildQueryCondition(query)
  const hasProps = Prisma.sql`props <> '[]'::jsonb`
  return condition === null
    ? Prisma.sql`WHERE ${hasProps}`
    : Prisma.sql`WHERE (${condition}) AND ${hasProps}`
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
           tags,
           props,
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM items
    ${where}
    ${buildOrderBy(sort)}
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `

  return { items, total, page: safePage, pageCount }
}

export interface ItemPropsResult {
  rows: ItemPropsRow[]
  // 上限を超えて表に載らなかった件数。黙って打ち切ると「これで全部」と
  // 読めてしまうため、呼び出し側が知らせられるように数を返す。
  omitted: number
}

// 特性表の元データ。検索ヒットのうちプロパティを持つノートを、一覧と同じ並びで返す。
// 一覧のページ送りとは独立に全ヒットを対象にするため、LIMIT は PAGE_SIZE ではなく
// PROPS_TABLE_LIMIT (ページを開いても表の中身が変わらないように)。
// 要約はここで作り、memo 全文をクライアントへ送らない。
export async function searchItemProps(
  query: string,
  sort: Sort = 'updated',
): Promise<ItemPropsResult> {
  const where = buildPropsWhere(query)
  // 上限より 1 件だけ多く取り、溢れているかを 1 クエリで判定する
  // (件数用に count を撃つより安い)。
  const rows = await prisma.$queryRaw<
    { itemNo: string; memo: string; props: unknown }[]
  >`
    SELECT item_no AS "itemNo",
           memo,
           props
    FROM items
    ${where}
    ${buildOrderBy(sort)}
    LIMIT ${PROPS_TABLE_LIMIT + 1}
  `

  const omitted =
    rows.length > PROPS_TABLE_LIMIT
      ? await countItemProps(where) - PROPS_TABLE_LIMIT
      : 0

  return {
    rows: rows.slice(0, PROPS_TABLE_LIMIT).map((row) => ({
      itemNo: row.itemNo,
      summary: memoSummary(row.memo),
      props: parseStoredProps(row.props),
    })),
    omitted,
  }
}

// 溢れたときだけ本当の総数を数える (通常の検索では撃たない)。
async function countItemProps(where: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM items ${where}
  `
  return rows[0]?.count ?? 0
}
