import { NextResponse } from 'next/server'
import { isCrossSiteRequest } from './crossSite'
import { currentUser } from './session'

// route handler 用の門番 (docs/18-ログイン計画.md)。
// 「ログインしているか」と「自分のページからの呼び出しか」の 2 つを見る。
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

// 第三者のページから動かされた呼び出しを断る (docs/18-ログイン計画.md §9)。
//
// **ログイン検査だけでは足りない**。Basic 認証は Cookie を使わないので
// SameSite が効かず、ログイン済みのブラウザは第三者のページに置かれた
// <img src="/api/books/…"> にも認証情報を付けてしまう。判定の理由は
// crossSite.ts に書いた。
//
// 使い方 (ログイン検査と並べる。順はログインが先 = uploads.ts と同じ流儀):
//   const denied = (await denyUnlessLoggedIn()) ?? denyCrossSite(request)
//   if (denied) return denied
export function denyCrossSite(request: Request): NextResponse | null {
  if (!isCrossSiteRequest(request)) {
    return null
  }
  return NextResponse.json(
    { success: false, data: null, error: 'クロスサイトからの呼び出しは許可されていません' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  )
}
