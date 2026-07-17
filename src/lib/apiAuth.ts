import { NextResponse } from 'next/server'
import { currentUser } from './session'

// route handler 用のログイン検査 (docs/18-ログイン計画.md)。
//
// proxy.ts も /api/* の未ログインを 401 にするが、それは楽観的な検査であって
// 唯一の砦にはしない (Next.js の authentication ガイドが明示している)。
// データに触る手前でもう一度確かめる。
//
// Server Action 側 (actions.ts) は requireUser() で投げてよい。route handler は
// 応答そのものを組み立てる場所なので、投げて 500 にするより 401 を返す。
//
// 使い方:
//   const denied = await denyUnlessLoggedIn()
//   if (denied) return denied
export async function denyUnlessLoggedIn(): Promise<NextResponse | null> {
  if ((await currentUser()) !== null) {
    return null
  }
  return NextResponse.json(
    { success: false, data: null, error: 'ログインが必要です' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}
