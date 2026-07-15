import { describe, expect, test } from 'vitest'
import { parseBasicAuthUser } from './auth'

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
