import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { GET as BooksGet } from './books/[isbn]/route'
import type { GET as ProductsGet } from './products/[jan]/route'

// 事前入力の 2 つの口 (/api/books/[isbn]・/api/products/[jan]) の拒否系。
// どちらも「ログイン済みのブラウザが第三者のページに動かされる」経路を
// 塞げているかを見る (docs/18-ログイン計画.md §9)。
//
// route を関数として直接呼ぶため headers() が投げる。ログイン検査だけ
// 差し替える (images.test.ts と同じ流儀)。検査そのもの (bcrypt 照合) は
// 本物を通す — モックすると認証が壊れていても拒否系が緑のままになる
const mocks = vi.hoisted(() => ({
  sessionToken: null as string | null,
  validToken: 'valid-session-token',
}))

// route を関数として直接呼ぶため、Next.js のリクエストスコープが無く
// cookies() が投げる。そこだけ差し替える。
//
// 認証はセッション Cookie で行う (docs/18-ログイン計画.md §11)。
// 判定そのもの (requestAuth.ts) は本物を通し、DB を叩く findActiveSession
// だけを差し替える — 判定ごとモックすると、認証が壊れていても拒否系の
// テストが緑のままになる
vi.mock('next/headers', async () => {
  const { SESSION_COOKIE_NAME } = await import('@/lib/sessionToken')
  return {
    headers: async () => new Headers(),
    cookies: async () => ({
      get: (name: string) =>
        name === SESSION_COOKIE_NAME && mocks.sessionToken !== null
          ? { name, value: mocks.sessionToken }
          : undefined,
    }),
  }
})

vi.mock('@/lib/sessionStore', () => ({
  findActiveSession: async (token: string) =>
    token === mocks.validToken
      ? { userName: 'tommie', expiresAt: new Date('2099-01-01T00:00:00.000Z') }
      : null,
}))


const ISBN = '9784873115658'
const JAN = '4901777018686'

// 既定はログイン済み。拒否系が見たいのは「ログインの先にある検査」なので、
// ログインで落ちると何も検査できない
beforeEach(() => {
  // 外部 API のキーは伏せる。ここに来る前に弾かれるのが期待値
  vi.stubEnv('YAHOO_SHOPPING_APP_ID', '')
  vi.stubEnv('RAKUTEN_APP_ID', '')
  mocks.sessionToken = mocks.validToken
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// route は @/lib/db を import し、db.ts は読み込み時に DATABASE_URL を要求する。
// 未設定のときだけ到達不能なダミーを置く (images.test.ts と同じ)
process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused'

const booksRequest = (headers?: Record<string, string>) =>
  [
    new Request(`http://localhost/api/books/${ISBN}`, { headers }),
    { params: Promise.resolve({ isbn: ISBN }) },
  ] as const

const productsRequest = (headers?: Record<string, string>) =>
  [
    new Request(`http://localhost/api/products/${JAN}`, { headers }),
    { params: Promise.resolve({ jan: JAN }) },
  ] as const

describe('事前入力の口の拒否系 (実 DB・外部 API 不要)', () => {
  let books: typeof BooksGet
  let products: typeof ProductsGet

  beforeAll(async () => {
    ;({ GET: books } = await import('./books/[isbn]/route'))
    ;({ GET: products } = await import('./products/[jan]/route'))
  })

  test('第三者のページの <img> から書影の口を叩けない', async () => {
    // これを通すと、悪意あるページを開いただけで書影が DB に溜まり、
    // 楽天のクォータが減る。外部 API を 1 回も叩かずに断ること
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const [request, ctx] = booksRequest({ 'sec-fetch-site': 'cross-site' })
    const res = await books(request, ctx)

    expect(res.status).toBe(403)
    expect((await res.json()).success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('第三者のページの <img> から商品情報の口を叩けない', async () => {
    // Yahoo! の利用枠を焚かれる
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const [request, ctx] = productsRequest({ 'sec-fetch-site': 'cross-site' })
    const res = await products(request, ctx)

    expect(res.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('別のサブドメインからも叩けない', async () => {
    const [request, ctx] = booksRequest({ 'sec-fetch-site': 'same-site' })
    expect((await books(request, ctx)).status).toBe(403)
  })

  test('自分のページからの fetch は通る (書影の口)', async () => {
    // 断り方が雑で自分のページまで閉め出していないか。
    // 収録なしの応答を返させ、200 まで届くことだけを見る
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('[null]', { status: 200 })))

    const [request, ctx] = booksRequest({ 'sec-fetch-site': 'same-origin' })
    const res = await books(request, ctx)

    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  // デモは外部 API のキーを持たないので、取得を試みず demoDisabled を返す
  // (docs/39-デモ公開計画.md §5)。黙って notFound にせず「デモ版では…」と明示する
  test('デモモードでは書影の口が demoDisabled を返す (外部 API を叩かない)', async () => {
    vi.stubEnv('DEMO_MODE', '1')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const [request, ctx] = booksRequest({ 'sec-fetch-site': 'same-origin' })
    const body = await (await books(request, ctx)).json()

    expect(body.demoDisabled).toBe(true)
    expect(body.error).toContain('デモ版')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('デモモードでは商品情報の口が demoDisabled を返す (外部 API を叩かない)', async () => {
    vi.stubEnv('DEMO_MODE', '1')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const [request, ctx] = productsRequest({ 'sec-fetch-site': 'same-origin' })
    const body = await (await products(request, ctx)).json()

    expect(body.demoDisabled).toBe(true)
    expect(body.error).toContain('デモ版')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('自分のページからの fetch は通る (商品情報の口)', async () => {
    const [request, ctx] = productsRequest({ 'sec-fetch-site': 'same-origin' })
    const res = await products(request, ctx)

    expect(res.status).toBe(200)
  })

  test('未ログインはクロスサイト判定より先に 401', async () => {
    // 断る理由の順が入れ替わっても、どちらでも断ってはいる。
    // ログインを先に見るのは既存の流儀 (uploads.ts) に揃えるため
    mocks.sessionToken = null
    const [request, ctx] = booksRequest({ 'sec-fetch-site': 'cross-site' })
    expect((await books(request, ctx)).status).toBe(401)
  })

  test('ISBN でない値は 400 (クロスサイトを通った後も検算する)', async () => {
    const request = new Request('http://localhost/api/books/4901777018686', {
      headers: { 'sec-fetch-site': 'same-origin' },
    })
    const res = await books(request, { params: Promise.resolve({ isbn: '4901777018686' }) })
    expect(res.status).toBe(400)
  })
})
