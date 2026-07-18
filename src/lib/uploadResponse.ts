// `POST /api/images` の応答 (共通エンベロープ `{success, data, error}`) を
// 解釈して画像 URL を取り出す。XHR 側の薄いグルーからロジックだけを分けて
// 単体テストできるようにする (uploadImageXhr.ts)。
//
// 失敗は例外で返す。成功したのに url が無い応答も「失敗」に倒す —
// undefined をそのまま通すと本文に `![](undefined)` が入ってしまい、
// 壊れた画像リンクが黙って保存される。

export function parseUploadResponse(status: number, responseText: string): string {
  let body: { success?: boolean; data?: { url?: string }; error?: string } | null
  try {
    body = JSON.parse(responseText)
  } catch {
    body = null
  }

  if (status < 200 || status >= 300 || !body?.success) {
    throw new Error(body?.error ?? `アップロードに失敗しました (HTTP ${status})`)
  }

  const url = body.data?.url
  if (typeof url !== 'string' || url === '') {
    throw new Error('アップロードに失敗しました (応答に画像 URL がありません)')
  }
  return url
}
