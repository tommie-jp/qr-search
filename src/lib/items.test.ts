import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { searchItems as SearchItemsFn } from './items'
import type { PrismaClient } from '@/generated/prisma/client'

// DB を実際に叩く統合テスト。
// 通常の `npm test` (および doDeploy の lint+test) では走らせず、
// DATABASE_URL があり かつ RUN_DB_TESTS=1 のときだけ実行する。
// db.ts はモジュール読み込み時に DATABASE_URL を要求するため、
// import は beforeAll 内で動的に行い、skip 時に評価されないようにする。
const runDbTests =
  !!process.env.DATABASE_URL && process.env.RUN_DB_TESTS === '1'

// 実データと衝突しないよう itemNo は "zzft" プレフィックスで統一し、後始末で消す。
const TEST_PREFIX = 'zzft'

describe.skipIf(!runDbTests)(
  'searchItems (integration; needs DATABASE_URL + RUN_DB_TESTS=1)',
  () => {
    let searchItems: typeof SearchItemsFn
    let prisma: PrismaClient

    const seed = [
      { itemNo: 'zzfta1', memo: 'zzfttoken zzftonlya1 ライト RITEX', url: '', mode: 'memo' as const },
      { itemNo: 'zzfta2', memo: 'zzfttoken ライト', url: '', mode: 'memo' as const },
      { itemNo: 'zzfta3', memo: 'zzfttoken ２ＳＣ１８１５', url: '', mode: 'memo' as const },
      {
        itemNo: 'zzfta4',
        memo: '',
        url: 'https://example.com/zzfturltoken',
        mode: 'url' as const,
      },
    ]

    beforeAll(async () => {
      ;({ searchItems } = await import('./items'))
      ;({ prisma } = await import('./db'))
      await prisma.item.deleteMany({ where: { itemNo: { startsWith: TEST_PREFIX } } })
      for (const s of seed) {
        await prisma.item.create({ data: { ...s, itemNoNum: null } })
      }
    })

    afterAll(async () => {
      if (!prisma) return
      await prisma.item.deleteMany({ where: { itemNo: { startsWith: TEST_PREFIX } } })
      await prisma.$disconnect()
    })

    const itemNos = (r: { items: { itemNo: string }[] }) =>
      r.items.map((i) => i.itemNo).sort()

    test('matches memo content across rows sharing a token (全文検索)', async () => {
      const r = await searchItems('zzfttoken', 1)
      expect(itemNos(r)).toEqual(['zzfta1', 'zzfta2', 'zzfta3'])
    })

    test('AND-searches space-separated terms (両方を含む行だけ)', async () => {
      const r = await searchItems('zzfttoken RITEX', 1)
      expect(itemNos(r)).toEqual(['zzfta1'])
    })

    // OR は seed 専用トークンだけで検証する (実データと衝突させない)。
    test('OR-searches with the OR keyword (どちらかを含む行)', async () => {
      const r = await searchItems('zzftonlya1 OR zzfturltoken', 1)
      expect(itemNos(r)).toEqual(['zzfta1', 'zzfta4'])
    })

    test('OR-searches with the pipe operator', async () => {
      const r = await searchItems('zzftonlya1|zzfturltoken', 1)
      expect(itemNos(r)).toEqual(['zzfta1', 'zzfta4'])
    })

    test('space binds tighter than OR (AND-group OR term)', async () => {
      // (zzfttoken AND zzftonlya1) OR zzfturltoken
      const r = await searchItems('zzfttoken zzftonlya1 OR zzfturltoken', 1)
      expect(itemNos(r)).toEqual(['zzfta1', 'zzfta4'])
    })

    test('AND-searches with a full-width space too', async () => {
      const r = await searchItems('ライト　zzfttoken', 1)
      expect(itemNos(r)).toEqual(['zzfta1', 'zzfta2'])
    })

    test('normalizes full/half width and case (２ＳＣ→2sc)', async () => {
      const r = await searchItems('zzfttoken 2sc1815', 1)
      expect(itemNos(r)).toEqual(['zzfta3'])
    })

    test('matches URL content', async () => {
      const r = await searchItems('zzfturltoken', 1)
      expect(itemNos(r)).toEqual(['zzfta4'])
    })

    test('keeps itemNo prefix search (前方一致)', async () => {
      const r = await searchItems('zzfta', 1)
      expect(itemNos(r)).toEqual(['zzfta1', 'zzfta2', 'zzfta3', 'zzfta4'])
    })

    test('returns zero results with a clean envelope', async () => {
      const r = await searchItems('zzfttoken nonexistenttokenxyz', 1)
      expect(r.total).toBe(0)
      expect(r.items).toEqual([])
      expect(r.pageCount).toBe(1)
    })

    test('clamps an out-of-range page to the last page', async () => {
      const r = await searchItems('zzfttoken', 999)
      expect(r.page).toBe(r.pageCount)
      expect(r.items).toHaveLength(3)
    })

    test('empty query browses all items (WHERE 無し)', async () => {
      const r = await searchItems('', 1)
      expect(r.total).toBeGreaterThanOrEqual(seed.length)
    })
  },
)
