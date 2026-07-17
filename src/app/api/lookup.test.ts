import bcrypt from 'bcryptjs'
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
const mocks = vi.hoisted(() => ({ authorization: null as string | null }))
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(mocks.authorization ? { authorization: mocks.authorization } : {}),
}))

const PASSWORD = 'test-password'
const HASH = bcrypt.hashSync(PASSWORD, 4)
const AUTH_HEADER = `Basic ${Buffer.from(`tommie:${PASSWORD}`, 'utf8').toString('base64')}`

const ISBN = '9784873115658'
const JAN = '4901777018686'

// 既定はログイン済み。拒否系が見たいのは「ログインの先にある検査」なので、
// ログインで落ちると何も検査できない
beforeEach(() => {
  vi.stubEnv('BASIC_AUTH_USER', 'tommie')
  vi.stubEnv('BASIC_AUTH_HASH_B64', Buffer.from(HASH, 'utf8').toString('base64'))
  // 外部 API のキーは伏せる。ここに来る前に弾かれるのが期待値
  vi.stubEnv('YAHOO_SHOPPING_APP_ID', '')
  vi.stubEnv('RAKUTEN_APP_ID', '')
  mocks.authorization = AUTH_HEADER
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

  test('自分のページからの fetch は通る (商品情報の口)', async () => {
    const [request, ctx] = productsRequest({ 'sec-fetch-site': 'same-origin' })
    const res = await products(request, ctx)

    expect(res.status).toBe(200)
  })

  test('未ログインはクロスサイト判定より先に 401', async () => {
    // 断る理由の順が入れ替わっても、どちらでも断ってはいる。
    // ログインを先に見るのは既存の流儀 (uploads.ts) に揃えるため
    mocks.authorization = null
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
