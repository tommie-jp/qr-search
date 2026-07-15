// ログインユーザーの取得。認証は Caddy のエッジで HTTP Basic 認証を行い
// (Caddyfile の basic_auth)、Authorization ヘッダーはそのまま app へ透過する。
// ここではヘッダーの解析だけを純関数として扱う (DB/リクエスト非依存でテストしやすくするため)。

const BASIC_PREFIX = 'basic '

// Authorization: Basic base64(user:password) からユーザー名を取り出す。
// 解析できないとき (ヘッダーなし・別スキーム・壊れた base64・
// ユーザー名が空) は null を返す。パスワードは扱わない (認証は Caddy の責務)。
export function parseBasicAuthUser(header: string | null): string | null {
  if (header === null) {
    return null
  }
  if (!header.toLowerCase().startsWith(BASIC_PREFIX)) {
    return null
  }

  const encoded = header.slice(BASIC_PREFIX.length).trim()
  if (encoded.length === 0) {
    return null
  }

  // Buffer.from は不正な base64 を例外にせず読み飛ばすため、
  // 往復させて元の文字列と一致するかで妥当性を判定する
  const buf = Buffer.from(encoded, 'base64')
  if (buf.toString('base64') !== encoded) {
    return null
  }

  const credentials = buf.toString('utf8')
  const separator = credentials.indexOf(':')
  if (separator <= 0) {
    // 区切りなし、またはユーザー名が空
    return null
  }
  return credentials.slice(0, separator)
}
