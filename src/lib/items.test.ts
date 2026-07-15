import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type {
  searchItemProps as SearchItemPropsFn,
  searchItems as SearchItemsFn,
  upsertMemo as UpsertMemoFn,
} from './items'
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
    let searchItemProps: typeof SearchItemPropsFn
    let upsertMemo: typeof UpsertMemoFn
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
      {
        itemNo: 'zzftt1',
        memo: 'zzfttagmemo #zzfttag1 #zzftshared',
        url: '',
        mode: 'memo' as const,
        tags: ['zzfttag1', 'zzftshared'],
      },
      {
        itemNo: 'zzftt2',
        memo: 'zzfttagmemo #zzfttag2 #zzftshared',
        url: '',
        mode: 'memo' as const,
        tags: ['zzfttag2', 'zzftshared'],
      },
      // 特性表用: 同じタグを共有し、片方だけ余分な列 (Vce) を持つ。
      {
        itemNo: 'zzftp1',
        memo: '2SC1815\n#zzftbjt\nhFE=400 Vf=650mV',
        url: '',
        mode: 'memo' as const,
        tags: ['zzftbjt'],
        props: [
          { key: 'hfe', label: 'hFE', value: '400' },
          { key: 'vf', label: 'Vf', value: '650mV' },
        ],
      },
      {
        itemNo: 'zzftp2',
        memo: '2SC2712-Y\n#zzftbjt\nhFE=208 Vce=50V',
        url: '',
        mode: 'memo' as const,
        tags: ['zzftbjt'],
        props: [
          { key: 'hfe', label: 'hFE', value: '208' },
          { key: 'vce', label: 'Vce', value: '50V' },
        ],
      },
      // 同じタグだがプロパティ行なし → 表には出さない。
      {
        itemNo: 'zzftp3',
        memo: 'プロパティのないノート\n#zzftbjt',
        url: '',
        mode: 'memo' as const,
        tags: ['zzftbjt'],
      },
    ]

    beforeAll(async () => {
      ;({ searchItems, searchItemProps, upsertMemo } = await import('./items'))
      ;({ prisma } = await import('./db'))
      await prisma.item.deleteMany({ where: { itemNo: { startsWith: TEST_PREFIX } } })
      for (const s of seed) {
        await prisma.item.create({ data: { itemNoNum: null, ...s } })
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

    describe('tag search', () => {
      test('#tag matches items carrying that tag', async () => {
        const r = await searchItems('#zzfttag1', 1)
        expect(itemNos(r)).toEqual(['zzftt1'])
      })

      test('a shared tag matches every item that has it', async () => {
        const r = await searchItems('#zzftshared', 1)
        expect(itemNos(r)).toEqual(['zzftt1', 'zzftt2'])
      })

      test('AND of two tags matches only items with both', async () => {
        const r = await searchItems('#zzftshared #zzfttag1', 1)
        expect(itemNos(r)).toEqual(['zzftt1'])
      })

      test('OR of two tags matches either', async () => {
        const r = await searchItems('#zzfttag1 OR #zzfttag2', 1)
        expect(itemNos(r)).toEqual(['zzftt1', 'zzftt2'])
      })

      test('tag search is exact, not substring of memo text', async () => {
        // zzfttagmemo は本文に含まれるがタグではないのでヒットしない
        const r = await searchItems('#zzfttagmemo', 1)
        expect(itemNos(r)).toEqual([])
      })

      test('a quoted "#tag" falls back to full-text (finds the literal in memo)', async () => {
        const r = await searchItems('"#zzfttag1"', 1)
        expect(itemNos(r)).toEqual(['zzftt1'])
      })
    })

    describe('props', () => {
      test('searchItems projects the props column onto the item', async () => {
        // 生 SQL の SELECT に props を足し忘れると undefined になる (型では気づけない)。
        const r = await searchItems('#zzftbjt', 1)
        const item = r.items.find((i) => i.itemNo === 'zzftp2')
        expect(item?.props).toEqual([
          { key: 'hfe', label: 'hFE', value: '208' },
          { key: 'vce', label: 'Vce', value: '50V' },
        ])
      })

      test('upsertMemo derives props from a property line', async () => {
        // タグは付けない: #zzftbjt を足すと searchItemProps のテストと干渉する。
        const item = await upsertMemo('zzftup1', '2SC9999\nhFE=123 Vf=700mV')
        expect(item.props).toEqual([
          { key: 'hfe', label: 'hFE', value: '123' },
          { key: 'vf', label: 'Vf', value: '700mV' },
        ])
      })

      test('upsertMemo clears props when the property line is removed', async () => {
        await upsertMemo('zzftup2', 'hFE=123')
        const item = await upsertMemo('zzftup2', 'ただの本文')
        expect(item.props).toEqual([])
      })

      test('searchItemProps returns only hits that have props', async () => {
        const { rows } = await searchItemProps('#zzftbjt')
        expect(rows.map((r) => r.itemNo).sort()).toEqual(['zzftp1', 'zzftp2'])
      })

      test('searchItemProps summarizes the memo for the device column', async () => {
        const { rows } = await searchItemProps('#zzftbjt')
        expect(rows.find((r) => r.itemNo === 'zzftp1')?.summary).toBe('2SC1815')
      })

      test('searchItemProps returns an empty list when nothing has props', async () => {
        expect(await searchItemProps('#zzfttag1')).toEqual({ rows: [], omitted: 0 })
      })

      test('searchItemProps reports nothing omitted when under the limit', async () => {
        expect((await searchItemProps('#zzftbjt')).omitted).toBe(0)
      })
    })
  },
)
