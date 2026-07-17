import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { POST as PostFn } from './route'
import type { GET as GetFn } from './[name]/route'
import type { PrismaClient } from '@/generated/prisma/client'

// route を関数として直接呼ぶため、Next.js のリクエストスコープが無く headers() が
// 投げる。ログイン検査 (lib/session.ts) が headers() を読むので、そこだけ差し替える。
// 検査そのもの (bcrypt 照合) は本物を通す — モックすると、認証が壊れていても
// 拒否系のテストが緑のままになる
const mocks = vi.hoisted(() => ({ authorization: null as string | null }))
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(mocks.authorization ? { authorization: mocks.authorization } : {}),
}))

const PASSWORD = 'test-password'
// コスト 4 で生成する (既定の 10 より速い。検算はハッシュ内のコストに従うため結果は同じ)
const HASH = bcrypt.hashSync(PASSWORD, 4)
const AUTH_HEADER = `Basic ${Buffer.from(`tommie:${PASSWORD}`, 'utf8').toString('base64')}`

// 既定はログイン済み。拒否系が見たいのは「ログインの先にある検査」なので、
// ログインで落ちてしまうと何も検査できない
beforeEach(() => {
  vi.stubEnv('BASIC_AUTH_USER', 'tommie')
  vi.stubEnv('BASIC_AUTH_HASH_B64', Buffer.from(HASH, 'utf8').toString('base64'))
  mocks.authorization = AUTH_HEADER
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// 画像は DB (images テーブル) に格納するため、往復の検証には実 DB が要る。
// DATABASE_URL があり かつ RUN_DB_TESTS=1 のときだけ実行する。
const runDbTests =
  !!process.env.DATABASE_URL && process.env.RUN_DB_TESTS === '1'

// 一方、拒否系 (CSRF・MIME・サイズ・不正ファイル名) はすべて DB へ到達する前に
// return するため、実 DB なしで検証できる。ルート配線が壊れていないことを
// 通常の `npm test` (doDeploy の lint+test) でも検知したいので DB ゲートに入れない。
//
// ただし route は @/lib/db を import し、db.ts は読み込み時に DATABASE_URL を要求する。
// そこで未設定のときだけ到達不能なダミーを置く。PrismaClient は遅延接続のため
// クエリを投げない限り接続しない = 拒否系が誤って DB に触れたら接続エラーで落ちる。
// (「DB に触れる前に弾く」契約そのもののテストにもなっている)
process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused'

// 1x1 の PNG (最小の有効な画像バイナリ)
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function uploadRequest(file: File, headers?: Record<string, string>): Request {
  const formData = new FormData()
  formData.set('file', file)
  return new Request('http://localhost/api/images', {
    method: 'POST',
    body: formData,
    headers,
  })
}

function getRequest(name: string): [Request, { params: Promise<{ name: string }> }] {
  return [
    new Request(`http://localhost/api/images/${name}`),
    { params: Promise.resolve({ name }) },
  ]
}

function pngFile(): File {
  return new File([PNG_BYTES], 'photo.png', { type: 'image/png' })
}

// db.ts は import 時に DATABASE_URL を読むため、routes の import は
// 上のダミー設定より後 (= beforeAll 内) で動的に行う。
describe('/api/images の拒否系 (実 DB 不要)', () => {
  let POST: typeof PostFn
  let GET: typeof GetFn

  beforeAll(async () => {
    ;({ POST } = await import('./route'))
    ;({ GET } = await import('./[name]/route'))
  })

  test('画像以外の MIME は 400 を返す', async () => {
    const file = new File(['<svg onload=alert(1)>'], 'x.svg', {
      type: 'image/svg+xml',
    })
    const res = await POST(uploadRequest(file))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })

  test('file フィールドがないと 400 を返す', async () => {
    const res = await POST(
      new Request('http://localhost/api/images', {
        method: 'POST',
        body: new FormData(),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('サイズ超過は 400 を返す', async () => {
    const big = new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    })
    const res = await POST(uploadRequest(big))
    expect(res.status).toBe(400)
  })

  test('MIME 偽装 (image/png を名乗る HTML) は 400 を返す', async () => {
    const fake = new File(['<html><script>alert(1)</script></html>'], 'x.png', {
      type: 'image/png',
    })
    const res = await POST(uploadRequest(fake))
    expect(res.status).toBe(400)
  })

  test('クロスオリジンの POST (CSRF) は 403 を返す', async () => {
    const res = await POST(
      uploadRequest(pngFile(), { origin: 'https://evil.example.com' }),
    )
    expect(res.status).toBe(403)
  })

  test('Content-Length が大きすぎる場合は本文を読まず 413 を返す', async () => {
    const res = await POST(
      new Request('http://localhost/api/images', {
        method: 'POST',
        headers: { 'content-length': String(100 * 1024 * 1024) },
        body: new FormData(),
      }),
    )
    expect(res.status).toBe(413)
  })

  test('GET: 不正なファイル名 (トラバーサル) は 400 を返す', async () => {
    const [req, ctx] = getRequest('..%2F..%2Fetc%2Fpasswd')
    const res = await GET(req, ctx)
    expect(res.status).toBe(400)
  })

  // ログイン検査 (docs/18-ログイン計画.md)。proxy.ts も未ログインを 401 にするが、
  // それは楽観的な検査でしかないので、route 自身が断れることをここで確かめる
  describe('未ログイン', () => {
    beforeEach(() => {
      mocks.authorization = null
    })

    test('POST は 401 を返す', async () => {
      const res = await POST(uploadRequest(pngFile()))
      expect(res.status).toBe(401)
    })

    test('GET は 401 を返す (画像はメモの中身そのもの)', async () => {
      const [req, ctx] = getRequest('00000000-0000-4000-8000-000000000000.png')
      const res = await GET(req, ctx)
      expect(res.status).toBe(401)
    })

    test('POST はファイル名の検査より先に断る (本文を読ませない)', async () => {
      // 中身が不正でも 400 ではなく 401。ログインしていない相手のために
      // 12MB のボディを読む理由はない
      const bad = new File(['<svg onload=alert(1)>'], 'x.svg', { type: 'image/svg+xml' })
      const res = await POST(uploadRequest(bad))
      expect(res.status).toBe(401)
    })
  })
})

describe.skipIf(!runDbTests)(
  '/api/images の DB 往復 (integration; needs DATABASE_URL + RUN_DB_TESTS=1)',
  () => {
    let POST: typeof PostFn
    let GET: typeof GetFn
    let prisma: PrismaClient

    // テストで作った画像は UUID 名のため前方一致で消せない。作った名前を控えて後始末する。
    const created: string[] = []

    beforeAll(async () => {
      ;({ POST } = await import('./route'))
      ;({ GET } = await import('./[name]/route'))
      ;({ prisma } = await import('@/lib/db'))
    })

    afterAll(async () => {
      if (!prisma) return
      await prisma.image.deleteMany({ where: { name: { in: created } } })
      await prisma.$disconnect()
    })

    // アップロードして保存名を返す (後始末のため名前を控える)
    async function upload(file: File, headers?: Record<string, string>): Promise<string> {
      const res = await POST(uploadRequest(file, headers))
      expect(res.status).toBe(200)
      const body = await res.json()
      const name = body.data.url.split('/').pop() as string
      created.push(name)
      return name
    }

    test('PNG をアップロードすると URL を返し、GET で同じバイト列が取得できる', async () => {
      const res = await POST(uploadRequest(pngFile()))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.url).toMatch(/^\/api\/images\/[0-9a-f-]{36}\.png$/)

      const name = body.data.url.split('/').pop() as string
      created.push(name)

      const [req, ctx] = getRequest(name)
      const getRes = await GET(req, ctx)
      expect(getRes.status).toBe(200)
      expect(getRes.headers.get('content-type')).toBe('image/png')
      const bytes = Buffer.from(await getRes.arrayBuffer())
      expect(bytes.equals(PNG_BYTES)).toBe(true)
    })

    test('アップロードした画像は DB に保存される (volume ではなく)', async () => {
      const name = await upload(pngFile())

      const row = await prisma.image.findUnique({ where: { name } })
      expect(row).not.toBeNull()
      expect(row?.mime).toBe('image/png')
      expect(Buffer.from(row?.data as Uint8Array).equals(PNG_BYTES)).toBe(true)
    })

    test('同一オリジンの POST は許可する', async () => {
      await upload(pngFile(), { origin: 'http://localhost', host: 'localhost' })
    })

    test('GET: 画像応答に長期キャッシュと nosniff ヘッダを付ける', async () => {
      const name = await upload(pngFile())
      const [req, ctx] = getRequest(name)
      const res = await GET(req, ctx)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable',
      )
    })

    test('GET: 存在しない画像は 404 を返す', async () => {
      const [req, ctx] = getRequest('00000000-0000-4000-8000-000000000000.png')
      const res = await GET(req, ctx)
      expect(res.status).toBe(404)
    })
  },
)
