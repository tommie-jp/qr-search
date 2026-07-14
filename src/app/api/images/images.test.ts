import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { POST } from './route'
import { GET } from './[name]/route'

// 1x1 の PNG (最小の有効な画像バイナリ)
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

let uploadDir: string

beforeAll(() => {
  uploadDir = mkdtempSync(join(tmpdir(), 'qr-search-uploads-'))
  process.env.UPLOAD_DIR = uploadDir
})

afterAll(() => {
  rmSync(uploadDir, { recursive: true, force: true })
  delete process.env.UPLOAD_DIR
})

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

test('PNG をアップロードすると URL を返し、GET で取得できる', async () => {
  const file = new File([PNG_BYTES], 'photo.png', { type: 'image/png' })
  const res = await POST(uploadRequest(file))
  expect(res.status).toBe(200)

  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.data.url).toMatch(/^\/api\/images\/[0-9a-f-]{36}\.png$/)

  const name = body.data.url.split('/').pop() as string
  const [req, ctx] = getRequest(name)
  const getRes = await GET(req, ctx)
  expect(getRes.status).toBe(200)
  expect(getRes.headers.get('content-type')).toBe('image/png')
  const bytes = Buffer.from(await getRes.arrayBuffer())
  expect(bytes.equals(PNG_BYTES)).toBe(true)
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
  const file = new File([PNG_BYTES], 'photo.png', { type: 'image/png' })
  const res = await POST(
    uploadRequest(file, { origin: 'https://evil.example.com' }),
  )
  expect(res.status).toBe(403)
})

test('同一オリジンの POST は許可する', async () => {
  const file = new File([PNG_BYTES], 'photo.png', { type: 'image/png' })
  const res = await POST(
    uploadRequest(file, { origin: 'http://localhost', host: 'localhost' }),
  )
  expect(res.status).toBe(200)
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

test('GET: 画像応答に nosniff ヘッダを付ける', async () => {
  const file = new File([PNG_BYTES], 'photo.png', { type: 'image/png' })
  const uploaded = await (await POST(uploadRequest(file))).json()
  const name = uploaded.data.url.split('/').pop() as string
  const [req, ctx] = getRequest(name)
  const res = await GET(req, ctx)
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
})

test('GET: 不正なファイル名 (トラバーサル) は 400 を返す', async () => {
  const [req, ctx] = getRequest('..%2F..%2Fetc%2Fpasswd')
  const res = await GET(req, ctx)
  expect(res.status).toBe(400)
})

test('GET: 存在しないファイルは 404 を返す', async () => {
  const [req, ctx] = getRequest('00000000-0000-4000-8000-000000000000.png')
  const res = await GET(req, ctx)
  expect(res.status).toBe(404)
})
