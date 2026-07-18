import { beforeEach, describe, expect, test, vi } from 'vitest'
import { verifyBasicAuthUser } from './auth'
import { resolveAuth, resolveUser } from './requestAuth'
import { findActiveSession } from './sessionStore'

vi.mock('./auth', () => ({ verifyBasicAuthUser: vi.fn() }))
vi.mock('./sessionStore', () => ({ findActiveSession: vi.fn() }))

const findActiveSessionMock = vi.mocked(findActiveSession)
const verifyBasicAuthUserMock = vi.mocked(verifyBasicAuthUser)

const BASIC_HEADER = `Basic ${Buffer.from('tommie:secret', 'utf8').toString('base64')}`

beforeEach(() => {
  vi.clearAllMocks()
  findActiveSessionMock.mockResolvedValue(null)
  verifyBasicAuthUserMock.mockResolvedValue(null)
})

describe('resolveUser', () => {
  test('returns the user behind a valid session cookie', async () => {
    findActiveSessionMock.mockResolvedValue({
      userName: 'tommie',
      expiresAt: new Date('2026-10-17T00:00:00.000Z'),
    })

    expect(await resolveUser('token', null)).toBe('tommie')
  })

  test('does not run the bcrypt path when the session cookie already matched', async () => {
    findActiveSessionMock.mockResolvedValue({
      userName: 'tommie',
      expiresAt: new Date('2026-10-17T00:00:00.000Z'),
    })

    await resolveUser('token', BASIC_HEADER)

    // パスキーで入っている人に毎回 bcrypt を回すと、vps2 では 1.75 秒
    // 待たされる (docs/18 §8)。Cookie が通った時点で終わりにする
    expect(verifyBasicAuthUserMock).not.toHaveBeenCalled()
  })

  test('falls back to Basic auth when there is no cookie', async () => {
    verifyBasicAuthUserMock.mockResolvedValue('tommie')

    expect(await resolveUser(null, BASIC_HEADER)).toBe('tommie')
  })

  test('falls back to Basic auth when the cookie is unknown or expired', async () => {
    verifyBasicAuthUserMock.mockResolvedValue('tommie')

    expect(await resolveUser('stale-token', BASIC_HEADER)).toBe('tommie')
  })

  test('returns null when neither the cookie nor the header is valid', async () => {
    expect(await resolveUser('stale-token', BASIC_HEADER)).toBe(null)
  })

  test('returns null when nothing was sent at all', async () => {
    expect(await resolveUser(null, null)).toBe(null)
  })

  test('still lets Basic auth through when the session lookup fails (DB down)', async () => {
    findActiveSessionMock.mockRejectedValue(new Error('connection refused'))
    verifyBasicAuthUserMock.mockResolvedValue('tommie')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // DB が落ちてもパスワードで入れる = 復旧経路が生きている (docs/29 §2)
    expect(await resolveUser('token', BASIC_HEADER)).toBe('tommie')
    // 握りつぶさず必ず記録する
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  test('does not treat a failed session lookup as a logged-in user', async () => {
    findActiveSessionMock.mockRejectedValue(new Error('connection refused'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await resolveUser('token', null)).toBe(null)

    consoleError.mockRestore()
  })
})

describe('resolveAuth', () => {
  test('reports a session login with the expiry so proxy.ts can extend it', async () => {
    const expiresAt = new Date('2026-10-17T00:00:00.000Z')
    findActiveSessionMock.mockResolvedValue({ userName: 'tommie', expiresAt })

    expect(await resolveAuth('token', null)).toEqual({
      via: 'session',
      userName: 'tommie',
      expiresAt,
    })
  })

  test('reports a Basic login without an expiry (nothing to extend)', async () => {
    verifyBasicAuthUserMock.mockResolvedValue('tommie')

    expect(await resolveAuth(null, BASIC_HEADER)).toEqual({
      via: 'basic',
      userName: 'tommie',
    })
  })

  test('returns null when nobody is logged in', async () => {
    expect(await resolveAuth(null, null)).toBe(null)
  })
})
