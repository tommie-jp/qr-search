import bcrypt from 'bcryptjs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { GET as GetFn } from './route'

// images.test.ts と同じ流儀: route を関数として直接呼ぶため next/headers を差し替える。
// ログイン検査 (bcrypt 照合) 自体は本物を通す (モックすると拒否系が緑のままになる)。
const mocks = vi.hoisted(() => ({ authorization: null as string | null }))
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(mocks.authorization ? { authorization: mocks.authorization } : {}),
}))

const PASSWORD = 'test-password'
const HASH = bcrypt.hashSync(PASSWORD, 4)
const AUTH_HEADER = `Basic ${Buffer.from(`tommie:${PASSWORD}`, 'utf8').toString('base64')}`

beforeEach(() => {
  vi.stubEnv('BASIC_AUTH_USER', 'tommie')
  vi.stubEnv('BASIC_AUTH_HASH_B64', Buffer.from(HASH, 'utf8').toString('base64'))
  mocks.authorization = AUTH_HEADER
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// route は @/lib/db を import し、db.ts は読み込み時に DATABASE_URL を要求する。
// 拒否系 (401/403) は DB へ到達する前に return するので、未設定なら到達不能な
// ダミーを置く (images.test.ts と同じ。誤って DB に触れたら接続エラーで落ちる)。
process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused'

async function importGet(): Promise<typeof GetFn> {
  const mod = await import('./route')
  return mod.GET
}

function getRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/image-search/index', { headers })
}

describe('拒否系 (DB に触れる前に弾く)', () => {
  test('未ログインは 401 を返す', async () => {
    mocks.authorization = null
    const GET = await importGet()

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
  })

  test('クロスサイトからの呼び出しは 403 を返す', async () => {
    // GET は Origin を送らない <img> でも狙われるため Sec-Fetch-Site を見る
    // (crossSite.ts)。ブラウザが第三者ページから出す要求は cross-site になる。
    const GET = await importGet()

    const res = await GET(getRequest({ 'sec-fetch-site': 'cross-site' }))

    expect(res.status).toBe(403)
  })
})
