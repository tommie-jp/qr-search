import bcrypt from 'bcryptjs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  __resetBasicAuthCacheForTest,
  BASIC_AUTH_CACHE_MAX,
  parseBasicAuthUser,
  verifyBasicAuthUser,
} from './auth'

// base64 は Buffer で組み立てる (テスト側で手書きしないことで意図を明確にする)
function basicHeader(credentials: string): string {
  return `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`
}

describe('parseBasicAuthUser', () => {
  test('returns the user name from a Basic auth header', () => {
    expect(parseBasicAuthUser(basicHeader('tommie:secret'))).toBe('tommie')
  })

  test('accepts a lower-case "basic" scheme', () => {
    const header = basicHeader('tommie:secret').replace('Basic', 'basic')
    expect(parseBasicAuthUser(header)).toBe('tommie')
  })

  test('keeps colons that belong to the password', () => {
    expect(parseBasicAuthUser(basicHeader('tommie:pa:ss'))).toBe('tommie')
  })

  test('returns the user name when the password is empty', () => {
    expect(parseBasicAuthUser(basicHeader('tommie:'))).toBe('tommie')
  })

  test('handles a non-ASCII user name', () => {
    expect(parseBasicAuthUser(basicHeader('とみー:secret'))).toBe('とみー')
  })

  test('returns null when the header is absent', () => {
    expect(parseBasicAuthUser(null)).toBe(null)
  })

  test('returns null for a non-Basic scheme', () => {
    expect(parseBasicAuthUser('Bearer sometoken')).toBe(null)
  })

  test('returns null when the user name is empty', () => {
    expect(parseBasicAuthUser(basicHeader(':secret'))).toBe(null)
  })

  test('returns null when there is no colon separator', () => {
    expect(parseBasicAuthUser(basicHeader('tommie'))).toBe(null)
  })

  test('returns null for undecodable base64', () => {
    expect(parseBasicAuthUser('Basic !!!not-base64!!!')).toBe(null)
  })

  test('returns null for an empty credentials section', () => {
    expect(parseBasicAuthUser('Basic ')).toBe(null)
  })
})

describe('verifyBasicAuthUser', () => {
  // 本物の bcrypt を通す (照合は verifyBasicAuthUser の仕事そのものなので
  // モックすると何も検査しないテストになる)。コストは既定の 10 ではなく 4 で
  // 生成する — 検算アルゴリズムはハッシュ内のコストに従うため結果は変わらず、
  // テストだけが速くなる
  const PASSWORD = 'correct horse'
  const HASH = bcrypt.hashSync(PASSWORD, 4)

  // 設定に入れるのは bcrypt ハッシュそのものではなく base64 (auth.ts の説明を参照)
  const b64 = (hash: string) => Buffer.from(hash, 'utf8').toString('base64')

  beforeEach(() => {
    // キャッシュは Authorization ヘッダを鍵に持つ。テスト間で持ち越すと
    // 「env を変えたのに前の判定が返る」で緑になってしまう
    __resetBasicAuthCacheForTest()
    vi.stubEnv('BASIC_AUTH_USER', 'tommie')
    vi.stubEnv('BASIC_AUTH_HASH_B64', b64(HASH))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  test('returns the user name when the password matches the hash', async () => {
    expect(await verifyBasicAuthUser(basicHeader(`tommie:${PASSWORD}`))).toBe('tommie')
  })

  test('returns null when the password is wrong', async () => {
    expect(await verifyBasicAuthUser(basicHeader('tommie:wrong'))).toBe(null)
  })

  test('returns null when the user name is wrong', async () => {
    expect(await verifyBasicAuthUser(basicHeader(`mallory:${PASSWORD}`))).toBe(null)
  })

  test('returns null when the header is absent', async () => {
    expect(await verifyBasicAuthUser(null)).toBe(null)
  })

  test('returns null for a forged non-Basic header', async () => {
    expect(await verifyBasicAuthUser('Bearer tommie')).toBe(null)
  })

  test('keeps colons that belong to the password', async () => {
    vi.stubEnv('BASIC_AUTH_HASH_B64', b64(bcrypt.hashSync('pa:ss', 4)))
    expect(await verifyBasicAuthUser(basicHeader('tommie:pa:ss'))).toBe('tommie')
  })

  // 設定漏れは「誰もログインできない (実害なし)」側へ倒す。逆に倒すと
  // env を書き忘れた本番が認証なしで開く (appEnv.ts と同じ考え方)
  test('returns null when BASIC_AUTH_USER is unset', async () => {
    vi.stubEnv('BASIC_AUTH_USER', '')
    expect(await verifyBasicAuthUser(basicHeader(`tommie:${PASSWORD}`))).toBe(null)
  })

  test('returns null when BASIC_AUTH_HASH_B64 is unset', async () => {
    vi.stubEnv('BASIC_AUTH_HASH_B64', '')
    expect(await verifyBasicAuthUser(basicHeader(`tommie:${PASSWORD}`))).toBe(null)
  })

  // 空パスワードを許すと、ハッシュ生成に失敗した env で誰でも入れてしまう
  test('returns null for an empty password', async () => {
    vi.stubEnv('BASIC_AUTH_HASH_B64', b64(bcrypt.hashSync('', 4)))
    expect(await verifyBasicAuthUser(basicHeader('tommie:'))).toBe(null)
  })

  test('returns null when the hash is not a valid bcrypt hash', async () => {
    vi.stubEnv('BASIC_AUTH_HASH_B64', b64('changeme'))
    expect(await verifyBasicAuthUser(basicHeader(`tommie:${PASSWORD}`))).toBe(null)
  })

  // bcrypt はわざと遅く、vps2 ではコスト 12 で約 1.75 秒かかる。毎リクエスト
  // 照合し直すと実用にならないので、成功したヘッダは覚える。
  // 「本当に省けているか」は compare の呼び出し回数で見る
  test('runs bcrypt once for a repeated valid header', async () => {
    const header = basicHeader(`tommie:${PASSWORD}`)
    const compare = vi.spyOn(bcrypt, 'compare')

    expect(await verifyBasicAuthUser(header)).toBe('tommie')
    expect(await verifyBasicAuthUser(header)).toBe('tommie')

    expect(compare).toHaveBeenCalledTimes(1)
  })

  // 鍵は「設定 + ヘッダ」の組。ヘッダだけを鍵にすると、パスワードを
  // 変えても古い資格情報がプロセス再起動まで通り続ける
  test('does not serve a cached user after the hash changes', async () => {
    const header = basicHeader(`tommie:${PASSWORD}`)
    expect(await verifyBasicAuthUser(header)).toBe('tommie')

    vi.stubEnv('BASIC_AUTH_HASH_B64', b64(bcrypt.hashSync('rotated', 4)))
    expect(await verifyBasicAuthUser(header)).toBe(null)
  })

  // 失敗を覚えると、当てずっぽうを送りつけるだけで上限つきキャッシュを
  // 埋められ、正しいエントリを追い出せてしまう
  test('does not cache failures', async () => {
    const header = basicHeader('tommie:wrong')
    const compare = vi.spyOn(bcrypt, 'compare')

    expect(await verifyBasicAuthUser(header)).toBe(null)
    expect(await verifyBasicAuthUser(header)).toBe(null)

    expect(compare).toHaveBeenCalledTimes(2)
  })

  // 覚える数に上限がないと、ヘッダを変えながら送りつけるだけでメモリを
  // 食い潰せる。上限を超えたら古いものから捨てる
  test('bounds the cache so that distinct headers cannot grow it forever', async () => {
    const header = basicHeader(`tommie:${PASSWORD}`)
    expect(await verifyBasicAuthUser(header)).toBe('tommie')

    // 通らないヘッダは覚えないので、上限を溢れさせるには通るヘッダが要る。
    // Basic 認証のヘッダは base64 なので、末尾の padding 相当を変えても
    // 同じ資格情報にデコードされる … という手は使えない。代わりに
    // ユーザ名と設定を差し替えて別エントリを積む
    for (let i = 0; i < BASIC_AUTH_CACHE_MAX; i++) {
      const password = `pw-${i}`
      vi.stubEnv('BASIC_AUTH_HASH_B64', b64(bcrypt.hashSync(password, 4)))
      expect(await verifyBasicAuthUser(basicHeader(`tommie:${password}`))).toBe('tommie')
    }

    vi.stubEnv('BASIC_AUTH_HASH_B64', b64(HASH))
    const compare = vi.spyOn(bcrypt, 'compare')
    // 最初のエントリは押し出されているはずなので、bcrypt をやり直す
    expect(await verifyBasicAuthUser(header)).toBe('tommie')
    expect(compare).toHaveBeenCalledTimes(1)
  })
})
