import { afterEach, describe, expect, test, vi } from 'vitest'

// apiAuth.ts は currentUser 経由で sessionStore → db を読み込む。db.ts は
// モジュール読み込み時に DATABASE_URL を要求して投げるため、他の route テストと
// 同じ流儀で sessionStore を差し替えて連鎖を断つ (denyIfDemoMode は session を
// 触らないので中身は空でよい)。
vi.mock('@/lib/sessionStore', () => ({
  findActiveSession: async () => null,
}))

import { denyIfDemoMode } from './apiAuth'

const originalDemo = process.env.DEMO_MODE

afterEach(() => {
  if (originalDemo === undefined) {
    delete process.env.DEMO_MODE
  } else {
    process.env.DEMO_MODE = originalDemo
  }
})

// route handler 用の門番。デモインスタンスで閉じる口 (パスキー登録・ENEX
// インポート・ログ) が共有アカウントで叩かれても 403 に倒す (docs/38 §4)。
describe('denyIfDemoMode', () => {
  test('デモでないときは通す (null)', () => {
    delete process.env.DEMO_MODE
    expect(denyIfDemoMode()).toBeNull()
  })

  test('デモのときは 403 で断る', async () => {
    process.env.DEMO_MODE = '1'
    const denied = denyIfDemoMode()
    expect(denied?.status).toBe(403)
    const body = await denied?.json()
    expect(body).toMatchObject({ success: false, error: 'デモモードでは利用できません' })
  })

  // 旗の欠落に頼らない設計の裏返し — "1" 以外はデモ扱いにしない (isDemoMode と同じ)
  test('DEMO_MODE=1 以外の値では断らない', () => {
    for (const value of ['', 'true', '0']) {
      process.env.DEMO_MODE = value
      expect(denyIfDemoMode(), `DEMO_MODE=${JSON.stringify(value)}`).toBeNull()
    }
  })
})
