// リクエストからログインユーザーを取る層 (docs/18-ログイン計画.md)。
//
// proxy.ts の門番だけを防御線にしない。Next.js の文書がはっきり書いているとおり
// (01-app/02-guides/authentication.md)、proxy は「楽観的な検査」であって
// 唯一の砦にしてはいけない。データに触る入口 (Server Action / route handler /
// ページ) では、ここでもう一度確かめる。
//
// ヘッダーの解析と bcrypt 照合そのものは auth.ts (next/headers に依存しない
// 純粋な層) が持つ。ここはリクエストと結びつける役だけ。

import { headers } from 'next/headers'
import { cache } from 'react'
import { verifyBasicAuthUser } from './auth'

// React の cache() で 1 レンダリングパスにつき 1 回に畳む。ページと
// そこに置いた各コンポーネントが別々に呼んでも、照合は 1 回で済む
export const currentUser = cache(async (): Promise<string | null> => {
  const header = (await headers()).get('authorization')
  return verifyBasicAuthUser(header)
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
