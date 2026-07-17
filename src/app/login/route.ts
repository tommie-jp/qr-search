import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyBasicAuthUser } from '@/lib/auth'
import { safeNextPath } from '@/lib/loginRedirect'

// ログインの口 (docs/18-ログイン計画.md)。
//
// 資格情報がなければ 401 + WWW-Authenticate を返し、ブラウザに認証ダイアログを
// 出させる。ダイアログを出す手段はこれしかない — だからログインは
// 「ここへ普通に画面遷移する」形にしてある (fetch や router.push では
// ダイアログが出ない。LoginButton.tsx のコメントも参照)。
//
// realm の保護空間はこの URL のディレクトリ、つまり '/' 配下。よって一度ここで
// 通れば、ブラウザは以後サイト全体へ資格情報を自分から送る (RFC 7617)。
// ログイン用のページを別に持たなくてよいのはこのため。

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await verifyBasicAuthUser(request.headers.get('authorization'))

  if (user === null) {
    return new NextResponse('ログインしてください。\n', {
      status: 401,
      headers: {
        // charset="UTF-8" … ユーザー名に非 ASCII を使えるようにする (RFC 7617)
        'WWW-Authenticate': 'Basic realm="qr-search", charset="UTF-8"',
        'Content-Type': 'text/plain; charset=utf-8',
        // 401 も含めて誰にも持たせない。前に nginx が居るため明示する
        'Cache-Control': 'no-store',
      },
    })
  }

  // next は外から来る値。素通しすると他所へ運ぶ踏み台になるので必ず検算する
  const next = safeNextPath(request.nextUrl.searchParams.get('next'))

  // Location は相対パスのまま返す (RFC 7231 が認めている)。
  // NextResponse.redirect() は絶対 URL を要求するため使わない — 絶対 URL に
  // すると、アプリが自分のホスト名を組み立てることになり、実測で
  // `http://0.0.0.0:3100/...` が出た。本番はアプリの前に nginx が居るので、
  // アプリが見ているホストとスキーム (http, コンテナの内側) は、ブラウザが
  // 居る場所 (https://qr.tommie.jp) と一致しない。相対なら組み立てずに済む
  return new NextResponse(null, {
    // 303 = 「GET で取り直せ」。307 だと POST が来たとき POST のまま
    // 転送されてしまう (ここは GET しか受けないが、意図を明示しておく)
    status: 303,
    headers: {
      Location: next,
      'Cache-Control': 'no-store',
    },
  })
}
