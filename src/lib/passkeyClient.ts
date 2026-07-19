// ブラウザ側からパスキーの口を叩く手順 (docs/29-パスキー計画.md §6)。
//
// 登録もログインも「① チャレンジを貰う → ② 認証器に署名させる →
// ③ 署名を送って検証させる」の 3 歩で、違うのは叩く URL だけ。
// その 3 歩をここに 1 度だけ書き、画面 (ボタン) は結果だけを扱う。
//
// **例外の文言はここで日本語にして投げる**。呼ぶ側がそのまま画面に出せる
// ようにするため。ブラウザや WebAuthn の生のエラー文は英語なうえ、
// 「NotAllowedError」のように理由も分からない。

import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import {
  PASSKEY_LOGIN_OPTIONS_PATH,
  PASSKEY_LOGIN_VERIFY_PATH,
  PASSKEY_REGISTER_OPTIONS_PATH,
  PASSKEY_REGISTER_VERIFY_PATH,
} from './authPaths'
import { clearPasskeyHint, markPasskeyUsedHere } from './passkeyHint'

// 利用者が Face ID のダイアログを閉じた・時間切れになった、のいずれか。
// ブラウザはどちらも NotAllowedError にまとめてしまい区別できない。
// **失敗として赤く出さない** — 自分でやめた操作を叱られるのは不快なので、
// 呼ぶ側はこれを見て黙って元に戻す
export class PasskeyCancelledError extends Error {
  constructor() {
    super('パスキーの操作が取り消されました')
    this.name = 'PasskeyCancelledError'
  }
}

export async function loginWithPasskey(): Promise<string> {
  let optionsJSON: unknown
  try {
    optionsJSON = await postForData(PASSKEY_LOGIN_OPTIONS_PATH, {})
  } catch (error) {
    // 404 = サーバに 1 つもパスキーが無い。この端末の実績も無効になったので
    // ヒントを捨てる (残すと毎回空振りの自動発火を試み続ける)。
    // それ以外の失敗 (通信断・503 など) は一時的なものなので実績は残す
    if (error instanceof PasskeyApiError && error.status === 404) {
      clearPasskeyHint()
    }
    throw error
  }

  const response = await runAuthenticator(() =>
    startAuthentication({ optionsJSON: optionsJSON as never }),
  )

  const result = (await postForData(PASSKEY_LOGIN_VERIFY_PATH, { response })) as {
    userName: string
  }

  // 「このブラウザでパスキーが使えた」実績。次回から自動ログインを試してよい
  markPasskeyUsedHere()

  return result.userName
}

export async function registerPasskey(label: string): Promise<void> {
  const optionsJSON = await postForData(PASSKEY_REGISTER_OPTIONS_PATH, {})

  const response = await runAuthenticator(() =>
    startRegistration({ optionsJSON: optionsJSON as never }),
  )

  await postForData(PASSKEY_REGISTER_VERIFY_PATH, { response, label })

  // 登録した端末には確実に鍵がある。ログインを待たずに実績として扱ってよい
  markPasskeyUsedHere()
}

// 認証器を動かすところ。取り消しだけを別の例外に翻訳する。
async function runAuthenticator<T>(start: () => Promise<T>): Promise<T> {
  try {
    return await start()
  } catch (error) {
    if (error instanceof Error && error.name === 'NotAllowedError') {
      throw new PasskeyCancelledError()
    }
    if (error instanceof Error && error.name === 'InvalidStateError') {
      // excludeCredentials に当たった = この端末は既に登録済み
      throw new Error('この端末のパスキーは既に登録されています')
    }
    // 残りは環境の問題 (対応していないブラウザなど)。原因を握りつぶさない
    console.error('認証器の呼び出しに失敗しました', error)
    throw new Error('この端末ではパスキーを利用できませんでした')
  }
}

// サーバが断ったときの例外。**status を持たせるのが要点** —
// 「パスキーが 1 つも無い (404)」と「一時的な失敗」を呼ぶ側が区別できないと、
// 通信が切れただけでこの端末の実績まで捨ててしまう。
//
// message はサーバが日本語で書いたものをそのまま持つので、画面へ直接出せる。
export class PasskeyApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PasskeyApiError'
    this.status = status
  }
}

// 封筒 ({ success, data, error }) を開けて data だけ返す。
// エラーはサーバが日本語で書いてくれているので、そのまま投げる。
async function postForData(path: string, body: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Cookie を送受りする口なので明示する (同一オリジンの既定ではあるが、
      // ここは Set-Cookie を受け取る側なので意図を残す)
      credentials: 'same-origin',
    })
  } catch (error) {
    console.error(`${path} への通信に失敗しました`, error)
    throw new Error('通信に失敗しました。電波の状態を確認してください')
  }

  let envelope: { success?: boolean; data?: unknown; error?: string | null }
  try {
    envelope = await response.json()
  } catch {
    // 502 の HTML が返ってきた場合など。JSON でないものを黙って無視しない
    throw new PasskeyApiError(
      `サーバから予期しない応答が返りました (${response.status})`,
      response.status,
    )
  }

  if (!response.ok || envelope.success !== true) {
    throw new PasskeyApiError(
      envelope.error || `処理に失敗しました (${response.status})`,
      response.status,
    )
  }

  return envelope.data
}
