// リクエストからログインユーザーを取る層 (docs/18-ログイン計画.md)。
//
// proxy.ts の門番だけを防御線にしない。Next.js の文書がはっきり書いているとおり
// (01-app/02-guides/authentication.md)、proxy は「楽観的な検査」であって
// 唯一の砦にしてはいけない。データに触る入口 (Server Action / route handler /
// ページ) では、ここでもう一度確かめる。
//
// 照合そのものは下の層が持つ。ここはリクエストと結びつける役だけ:
//
//   auth.ts         … Basic 認証の解析と bcrypt 照合
//   sessionStore.ts … セッション Cookie の照合
//   requestAuth.ts  … その 2 つを試す**順番**の正本 (docs/29-パスキー計画.md)

import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { resolveUser } from './requestAuth'
import { SESSION_COOKIE_NAME } from './sessionToken'

// React の cache() で 1 レンダリングパスにつき 1 回に畳む。ページと
// そこに置いた各コンポーネントが別々に呼んでも、照合は 1 回で済む
export const currentUser = cache(async (): Promise<string | null> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  return resolveUser(
    cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null,
    headerList.get('authorization'),
  )
})

// ログアウトボタンを出してよいか (docs/29-パスキー計画.md §4)。
//
// Basic 認証ではログアウトできない — 資格情報を握っているのはブラウザで、
// サーバから忘れさせる手段がないため。押しても何も起きないボタンは出さない。
//
// Cookie の有無だけを見る。期限切れの Cookie が残っていると押せてしまうが、
// そのときログアウトは「古い Cookie を消す」という正しい仕事をする
export const canLogOut = cache(async (): Promise<boolean> => {
  return (await cookies()).get(SESSION_COOKIE_NAME) !== undefined
})

// requireUser() が投げる印。通常の経路では proxy.ts が先に止めるため、
// これが飛ぶのは「門番をすり抜けた」ときだけ。握りつぶさず 500 で落とす
// ほうがよい (静かに素通しするより気づける)
export class UnauthorizedError extends Error {
  constructor() {
    super('ログインが必要です')
    this.name = 'UnauthorizedError'
  }
}

// ログイン必須の処理の先頭で呼ぶ。通らなければ投げる
export async function requireUser(): Promise<string> {
  const user = await currentUser()
  if (user === null) {
    throw new UnauthorizedError()
  }
  return user
}
