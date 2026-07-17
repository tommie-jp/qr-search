// HTTP Basic 認証の解析と照合 (docs/18-ログイン計画.md)。
//
// 認証はかつて Caddy / nginx のエッジで行い、app はヘッダーからユーザー名を
// 読むだけだった。いまはアプリがパスワードまで照合する。ヘッダーだけ出せば
// 素通りする作りにはできない — ログインせずにヘッダ (画面上部の帯) を出すには
// エッジの認証を外すしかなく、外した以上 `Authorization` は誰でも自称できる
// ただの文字列になるため。
//
// 照合は BASIC_AUTH_USER と BASIC_AUTH_HASH_B64 (bcrypt ハッシュの base64) で行う。
//
// この階層は next/headers に触らないこと。proxy.ts (リクエスト前) と
// route handler (リクエスト中) の両方から呼ぶため。リクエストから
// ユーザーを取るのは session.ts の役目。

import bcrypt from 'bcryptjs'

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

// Authorization ヘッダーからパスワードを取り出す。ユーザー名側の判定は
// parseBasicAuthUser と揃える (解析できないヘッダーはどちらも null)。
function parseBasicAuthPassword(header: string | null): string | null {
  if (parseBasicAuthUser(header) === null) {
    return null
  }
  const encoded = (header as string).slice(BASIC_PREFIX.length).trim()
  const credentials = Buffer.from(encoded, 'base64').toString('utf8')
  return credentials.slice(credentials.indexOf(':') + 1)
}

interface BasicAuthConfig {
  user: string
  hash: string
}

// なぜ base64 で持つのか (ハマった落とし穴なので必ず読むこと):
//
// bcrypt ハッシュは `$2b$10$...` と `$` を含む。これを .env に生で書くと
// Next.js の env 読み込み (@next/env → dotenv-expand) が `$2b` `$10` `$INHJ…` を
// 「変数参照」と解釈して展開し、値が壊れる。実測では 60 文字のハッシュが
// 6 文字になった。しかも タチが悪いことに:
//
//   * シェルや docker compose で正しい値を渡していても、.env に同じキーが
//     あるだけで上書き的に壊される
//   * 本番 (Docker) は .dockerignore が .env を除くため壊れない
//     → 「ローカルだけ誰もログインできない」という気づきにくい形で出る
//
// `\$` エスケープは使えない。compose は `\$` を解釈しないため、
// エスケープした .env の値がそのままコンテナへ渡り、今度は本番が壊れる。
// base64 なら `$` を含まないので、.env・compose・Docker のどの経路でも
// 同じ値がそのまま届く。これが「両方が壊れない」唯一の持ち方だった。
//
// 生成: npm run hash-password (docs/18-ログイン計画.md)
function readBasicAuthConfig(): BasicAuthConfig | null {
  const user = process.env.BASIC_AUTH_USER
  const hashB64 = process.env.BASIC_AUTH_HASH_B64

  // 設定漏れは「誰もログインできない」側へ倒す。逆に倒すと、env を書き忘れた
  // 本番が認証なしで開く — 起きてほしくないのはそちら (appEnv.ts と同じ考え方)。
  // 「動かない」はすぐ気づけるが、「素通し」は気づけない
  if (!user || !hashB64) {
    return null
  }

  const hash = Buffer.from(hashB64, 'base64').toString('utf8')
  if (hash.length === 0) {
    return null
  }
  return { user, hash }
}

// 照合済みヘッダーの記憶。bcrypt はわざと遅く、vps2 (非力) では
// コスト 12 で約 1.75 秒かかる (コスト 14 だと実測 7 秒で、遅すぎたので下げた)。
// 毎リクエスト回すと使い物にならないので、一度通ったヘッダーは覚える。
//
// 鍵に設定を含めるのは、パスワードを変えたとき古い資格情報がプロセス再起動まで
// 通り続けるのを防ぐため。失敗は覚えない — 覚えると、当てずっぽうを送りつける
// だけで上限までキャッシュを埋め、正しいエントリを追い出せてしまう。
//
// 上限つき。ヘッダーを変えながら送りつけるだけでメモリを食い潰せる作りにしない。
export const BASIC_AUTH_CACHE_MAX = 8

const verifiedHeaders = new Map<string, string>()

function cacheKey(config: BasicAuthConfig, header: string): string {
  // 区切りに \n を使う。base64 と bcrypt ハッシュのどちらにも現れないため、
  // 別々の (設定, ヘッダー) の組が同じ鍵に潰れることがない
  return `${config.user}\n${config.hash}\n${header}`
}

export function __resetBasicAuthCacheForTest(): void {
  verifiedHeaders.clear()
}

// Authorization ヘッダーを検証し、通ればユーザー名を返す。通らなければ null。
//
// proxy.ts と session.ts の両方がこれを呼ぶ (Next.js は proxy を別バンドルに
// するため、キャッシュは共有されない。どちらも自前で温まる)。
export async function verifyBasicAuthUser(header: string | null): Promise<string | null> {
  const config = readBasicAuthConfig()
  if (config === null || header === null) {
    return null
  }

  const user = parseBasicAuthUser(header)
  const password = parseBasicAuthPassword(header)
  if (user === null || password === null) {
    return null
  }

  const key = cacheKey(config, header)
  const cached = verifiedHeaders.get(key)
  if (cached !== undefined) {
    return cached
  }

  // ユーザー名が違えば bcrypt を回さずに落とす。ユーザー名は秘密ではない
  // (このリポジトリのコメントにも書いてある) ので、応答時間から知られても
  // 失うものがない。むしろ毎回 1 秒の bcrypt を回すほうが、存在しない
  // ユーザー名を送りつけるだけで CPU を潰せる隙になる
  if (user !== config.user) {
    return null
  }

  // 空パスワードを許さない。bcrypt.compare('', hash) は空文字のハッシュとは
  // 一致してしまうため、ハッシュ生成に失敗した env で誰でも入れる隙になる
  if (password.length === 0) {
    return null
  }

  // 壊れたハッシュ (例: .env.example の 'changeme' のまま) で compare は
  // 投げる。ここで握って null にする — 設定ミスは「ログインできない」に
  // 落ち、500 でスタックトレースを晒さない
  let matches: boolean
  try {
    matches = await bcrypt.compare(password, config.hash)
  } catch {
    console.error(
      'BASIC_AUTH_HASH_B64 が bcrypt ハッシュ (の base64) として読めません。' +
        '生成方法は docs/18-ログイン計画.md を参照',
    )
    return null
  }

  if (!matches) {
    return null
  }

  // Map は挿入順を保つので、先頭 = 最も古い
  if (verifiedHeaders.size >= BASIC_AUTH_CACHE_MAX) {
    const oldest = verifiedHeaders.keys().next().value
    if (oldest !== undefined) {
      verifiedHeaders.delete(oldest)
    }
  }
  verifiedHeaders.set(key, user)

  return user
}
