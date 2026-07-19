import { NextResponse } from 'next/server'
import { denyCrossSite, denyUnlessLoggedIn } from '@/lib/apiAuth'
import { clearLogBuffer } from '@/lib/logBuffer'

// ログの控えを消す (docs/30-ブラウザログ計画.md §7)。/logs のクリアボタンが呼ぶ。
// 実機調査で「ここから先が今回の再現」と区切りを付けるための口。
//
// 門番は他の口と同じ二段 (apiAuth.ts)。同一サイトの検査も要る —
// 開けっ放しにすると、第三者のページからログイン済みのブラウザを使って
// 調査中の証拠を消せてしまう。
export async function POST(request: Request): Promise<NextResponse> {
  const denied = (await denyUnlessLoggedIn()) ?? denyCrossSite(request)
  if (denied) {
    return denied
  }

  clearLogBuffer()

  return NextResponse.json(
    { success: true, data: null, error: null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
