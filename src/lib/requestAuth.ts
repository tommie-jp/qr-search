// 「このリクエストは誰か」を決める順番の正本 (docs/29-パスキー計画.md §4)。
//
// 認証手段が 2 つになった。順番はここだけに書く — proxy.ts と session.ts の
// 両方が同じ判定をする必要があり、二か所に書くと片方だけ直して穴が開く
// (publicPaths.ts をエッジから移したときと同じ理由)。
//
// 順番は **Cookie が先、Basic が後**:
//
//   1. セッション Cookie … sha256 の照合 1 回。ミリ秒で終わる
//   2. Basic 認証        … bcrypt コスト 12。vps2 では 1.75 秒かかる
//
// 逆にすると、パスキーで入っている人が毎リクエスト bcrypt を踏む。
//
// この階層は next/headers に触らない。値 (Cookie の文字列と Authorization
// ヘッダ) を渡してもらう側に徹することで、proxy.ts (リクエスト前) と
// route handler / Server Component (リクエスト中) の両方から呼べる。

import { verifyBasicAuthUser } from './auth'
import { findActiveSession, type ActiveSession } from './sessionStore'

// どちらの手段で通ったかまで返す。proxy.ts が期限の延長を判断するのに
// expiresAt が要り、ヘッダのログアウトボタンは「セッションで入っているとき
// だけ」出したいため (Basic ではログアウトできない。docs/29 §4)。
export type AuthResult =
  | { via: 'session'; userName: string; expiresAt: Date }
  | { via: 'basic'; userName: string }

export async function resolveAuth(
  sessionToken: string | null,
  authHeader: string | null,
): Promise<AuthResult | null> {
  const session = await sessionOrNull(sessionToken)
  if (session !== null) {
    return { via: 'session', userName: session.userName, expiresAt: session.expiresAt }
  }

  const userName = await verifyBasicAuthUser(authHeader)
  return userName === null ? null : { via: 'basic', userName }
}

// 名前だけでよい呼び出し側 (session.ts) 用。
export async function resolveUser(
  sessionToken: string | null,
  authHeader: string | null,
): Promise<string | null> {
  return (await resolveAuth(sessionToken, authHeader))?.userName ?? null
}

// DB を見に行く側。落ちていても Basic 認証まで進めるように、ここで受け止める。
//
// 素通しにはしない (認証できないものは null = 未ログイン)。DB が死んでいる
// あいだもパスワードでは入れる、というのが要点 — パスキーの復旧経路として
// Basic を残した意味 (docs/29 §2) がここでも効く。
async function sessionOrNull(sessionToken: string | null): Promise<ActiveSession | null> {
  if (sessionToken === null || sessionToken.length === 0) {
    return null
  }

  try {
    return await findActiveSession(sessionToken)
  } catch (error) {
    // 握りつぶさない。「パスキーで入れないが原因が分からない」を防ぐ
    console.error('セッションの照合に失敗しました (Basic 認証で続行します)', error)
    return null
  }
}
