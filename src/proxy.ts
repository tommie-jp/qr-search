import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyBasicAuthUser } from '@/lib/auth'
import { LOGIN_REQUIRED_PATH } from '@/lib/loginRedirect'
import { isPublicPath } from '@/lib/publicPaths'

// ログインの門番 (docs/18-ログイン計画.md)。
//
// Next.js 16 で middleware は proxy に改称された (機能は同じ)。ファイル名は
// proxy.ts でなければ読まれない。また 16 からは Node.js ランタイムが既定
// なので、ここで bcrypt を回せる (旧 middleware の Edge ランタイムでは無理だった)。
//
// なぜ「ここ」なのか: 認証をエッジ (nginx / Caddy) から外したのは、ログイン
// しなくてもヘッダの帯を出すため。外した以上 401 を返す誰かが要る。ここに
// 置けば、新しいページを足したとき黙って公開されることがない
// (公開したいものだけを publicPaths.ts に明記する = 既定が閉じている)。
//
// ただしこれは Next.js の言う「楽観的な検査」であって唯一の砦ではない
// (01-app/02-guides/authentication.md)。データに触る入口では session.ts の
// requireUser() がもう一度確かめる。

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const user = await verifyBasicAuthUser(request.headers.get('authorization'))
  if (user !== null) {
    return NextResponse.next()
  }

  // 画面の取得は、URL をそのままに案内へ差し替える (redirect ではなく rewrite)。
  // ブラウザのアドレス欄が /item/ABC のまま残るので、ログインすれば
  // 再読み込みだけでその場に戻れる。
  //
  // ここで 401 + WWW-Authenticate を返さないのは意図的。それをやると
  // 「ログインしなくてもヘッダを出す」という今回の目的そのものが壊れ、
  // どのページを開いてもいきなり認証ダイアログが出る昔の挙動に戻る
  if (isPageRequest(request)) {
    return NextResponse.rewrite(new URL(LOGIN_REQUIRED_PATH, request.nextUrl))
  }

  // API と書き込み (Server Action の POST を含む) は機械が読む口なので、
  // 案内の HTML を返しても意味がない。素直に断る
  return NextResponse.json(
    { success: false, data: null, error: 'ログインが必要です' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

// 人がブラウザで開いている画面かどうか。Server Action は現在のページの URL へ
// POST されるため、メソッドを見ないと「保存」が案内ページに化けて黙って失敗する
function isPageRequest(request: NextRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }
  return !request.nextUrl.pathname.startsWith('/api/')
}

export const config = {
  // matcher を書かないと _next/static や public/ の中身にまで走り、CSS や JS が
  // 認証に引っかかって画面が崩れる。ここで挙げるのは「素通しするもの」の否定。
  //
  // _next/static … ビルド成果物 (JS/CSS)。中身はどのみち誰でも読める
  // _next/image  … 画像最適化
  // favicon.ico  … ブラウザが資格情報なしで取りに行く
  //
  // 画面と API はここに残す = 既定で門番を通る。ログイン不要なものは
  // publicPaths.ts に明記する
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
