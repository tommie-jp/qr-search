import { describe, expect, test } from 'vitest'
import { loginCancelledPage } from './cancelledPage'

describe('loginCancelledPage', () => {
  test('links back to the page the visitor came from', () => {
    const html = loginCancelledPage('/item/4518')

    expect(html).toContain('href="/item/4518"')
  })

  test('links to the top page when there is no return target', () => {
    const html = loginCancelledPage('/')

    expect(html).toContain('href="/"')
  })

  test('escapes the return target so it cannot break out of the attribute', () => {
    const html = loginCancelledPage('/item/"><script>alert(1)</script>')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })

  test('never reloads /login on its own', () => {
    // 自動で戻すと /login を読み直し、認証ダイアログが出続ける輪になる。
    // 戻るのは必ず人が押したときだけ
    const html = loginCancelledPage('/item/4518')

    expect(html).not.toContain('http-equiv')
    expect(html).not.toContain('<script')
  })

  test('tells the visitor that login was cancelled', () => {
    const html = loginCancelledPage('/')

    expect(html).toContain('ログインを中止しました')
  })
})
