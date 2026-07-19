import { NextResponse } from 'next/server'
import { denyCrossSite, denyUnlessLoggedIn } from '@/lib/apiAuth'
import { deviceLabel, parseClientLogPayload } from '@/lib/clientLogPayload'
import { pushBrowserLogs } from '@/lib/logBuffer'

// ブラウザで起きた失敗を受け取る (docs/30-ブラウザログ計画.md §1)。
// 控えは /logs がサーバのログと混ぜて出す。
//
// 門番は他の口と同じ二段 (apiAuth.ts)。proxy.ts も未ログインの /api/* を
// 401 にするが、それは楽観的な検査であって唯一の砦にはしない。
// 同一サイトの検査も要る — 開けっ放しにすると、第三者のページから
// ログイン済みのブラウザを使ってバッファを埋め、本物の警告を押し流せる。
export async function POST(request: Request): Promise<NextResponse> {
  const denied = (await denyUnlessLoggedIn()) ?? denyCrossSite(request)
  if (denied) {
    return denied
  }

  // 本文の検証は parseClientLogPayload に持たせる (送る側と同じ定義を見る)。
  // JSON にすらならない本文もここで断つ — 投げて 500 にすると、
  // 「ログを送れない」がサーバのエラーログを埋める本末転倒になる
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest()
  }

  const items = parseClientLogPayload(body)
  if (items === null) {
    return badRequest()
  }

  pushBrowserLogs(items, deviceLabel(request.headers.get('user-agent')))

  // 送りっぱなしで良い口なので中身は返さない (Beacon は応答を読めない)
  return NextResponse.json(
    { success: true, data: null, error: null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function badRequest(): NextResponse {
  return NextResponse.json(
    { success: false, data: null, error: 'ログの形式が不正です' },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  )
}
