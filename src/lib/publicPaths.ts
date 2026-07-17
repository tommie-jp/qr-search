// ログインなしで開いてよいパス (docs/18-ログイン計画.md)。
//
// かつては nginx / Caddy 側の @pwa_public / `auth_basic off` がこの役目を
// 持っていた。認証をアプリへ移した以上、その一覧もここへ移す。
// エッジとアプリの二か所に散らすと、片方だけ直して穴が開く。
//
// 判定は「一覧に載っているものだけ公開」。前方一致は使わない —
// '/docs' で始まるものを通すと '/docsecret' まで開いてしまう。

import manifest from '@/app/manifest'
import { LOGIN_PATH, LOGIN_REQUIRED_PATH } from './loginRedirect'

// PWA: ブラウザは manifest とアイコンを Authorization ヘッダなしで取りに行く。
// 閉じると 401 になり「インストール可能」と判定されない。
// どちらも秘密を含まないので公開してよい。
//
// アイコンは manifest.ts から導出する。手で並べると、アイコンを足したとき
// ここを直し忘れて PWA が黙って壊れる (実際 icon-512.png を書き落とした)。
// manifest が要求するものは必ず取れる、を構造で保証する
function pwaPaths(): Set<string> {
  const iconSrcs = (manifest().icons ?? [])
    .map((icon) => icon.src)
    .filter((src): src is string => typeof src === 'string')

  return new Set([
    '/manifest.webmanifest',
    ...iconSrcs,
    // manifest には載らないが、ブラウザが自分で取りに行くもの。
    // icon.svg はタブの favicon、apple-icon.png は iOS のホーム画面
    // (どちらも app/ 直下の特別ファイルで Next.js が配信する)
    '/icon.svg',
    '/apple-icon.png',
  ])
}

// 使い方の説明。ノートの中身は出ず、リポジトリの docs/*.md をそのまま
// 表示しているだけなので公開してよい (app/docs/*/page.tsx)
const DOCS_PATHS = new Set(['/docs/search', '/docs/memo'])

// ログインの入口そのもの。閉じるとログインできない
const LOGIN_PATHS = new Set([LOGIN_PATH, LOGIN_REQUIRED_PATH])

// manifest() は APP_ENV を読む (色を変えるため) が、パスの一覧は環境で
// 変わらない。毎リクエスト組み直す必要はないので一度だけ作る
let pwaPathsCache: Set<string> | null = null

export function isPublicPath(pathname: string): boolean {
  pwaPathsCache ??= pwaPaths()
  return LOGIN_PATHS.has(pathname) || pwaPathsCache.has(pathname) || DOCS_PATHS.has(pathname)
}
