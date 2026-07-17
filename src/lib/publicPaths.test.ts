import { describe, expect, test } from 'vitest'
import manifest from '@/app/manifest'
import { isPublicPath } from './publicPaths'

describe('isPublicPath', () => {
  // PWA: ブラウザは manifest とアイコンを Authorization ヘッダなしで取りに行く。
  // ここを閉じると「インストール可能」と判定されない (かつては nginx / Caddy 側の
  // @pwa_public がこの役目を持っていた。移設先がここ)
  test.each([
    '/manifest.webmanifest',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-512-maskable.png',
    '/apple-icon.png',
  ])('%s is public (PWA needs it without credentials)', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  // 上の一覧は手で書いたもの。アイコンが増えたときに書き足し忘れても、
  // manifest が実際に要求するものは必ず開いていることをここで縛る
  // (icon-512.png を一度書き落として PWA を壊しかけた)
  test('every icon the manifest asks for is public', () => {
    const iconSrcs = (manifest().icons ?? []).map((icon) => icon.src)

    expect(iconSrcs.length).toBeGreaterThan(0)
    for (const src of iconSrcs) {
      expect(isPublicPath(src), `${src} は manifest が要求しているのに閉じている`).toBe(true)
    }
  })

  // ログインの入口そのもの。閉じるとログインできない
  test.each(['/login', '/login-required'])('%s is public', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  // 使い方の説明にノートの中身は出ない
  test.each(['/docs/search', '/docs/memo'])('%s is public (help text only)', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  // ここから下が本題。ノートの中身が出る画面は閉じる
  test.each([
    '/',
    '/item/ABC123',
    '/edit/ABC123',
    '/print/ABC123',
    '/trash',
    '/api/images/x.png',
    '/api/books/9784873115658',
    '/api/products/4901234567894',
  ])('%s is not public', (path) => {
    expect(isPublicPath(path)).toBe(false)
  })

  // 前方一致で判定すると /docs にぶら下がっていない別物まで開いてしまう
  test('does not open paths that merely start with a public path', () => {
    expect(isPublicPath('/docsecret')).toBe(false)
    expect(isPublicPath('/login-secrets')).toBe(false)
    expect(isPublicPath('/icon.svg.php')).toBe(false)
    expect(isPublicPath('/item/icon.svg')).toBe(false)
  })
})
