import { expect, test, vi } from 'vitest'
import { canShareFiles, isShareAborted, sharePdf } from './shareFile'

function fakeNavigator(options: {
  share?: unknown
  canShare?: unknown
}): Navigator {
  return options as unknown as Navigator
}

test('share と canShare が揃い、ファイルを受け付けるなら true', () => {
  const nav = fakeNavigator({
    share: () => Promise.resolve(),
    canShare: () => true,
  })
  expect(canShareFiles(nav)).toBe(true)
})

test('share が無ければ false', () => {
  expect(canShareFiles(fakeNavigator({ canShare: () => true }))).toBe(false)
})

// URL 共有はできてもファイル共有はできない環境がある (Web Share Level 2 が別物)。
// share の有無だけで判断すると、押しても失敗するボタンを出してしまう
test('canShare が無ければ false (share だけでは判断しない)', () => {
  expect(canShareFiles(fakeNavigator({ share: () => {} }))).toBe(false)
})

test('canShare がファイルを拒否するなら false', () => {
  const nav = fakeNavigator({ share: () => {}, canShare: () => false })
  expect(canShareFiles(nav)).toBe(false)
})

test('canShare が投げても false を返す (throw しない)', () => {
  const nav = fakeNavigator({
    share: () => {},
    canShare: () => {
      throw new Error('not supported')
    },
  })
  expect(() => canShareFiles(nav)).not.toThrow()
  expect(canShareFiles(nav)).toBe(false)
})

test('ファイル名と PDF の MIME を付けて共有する', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  const nav = fakeNavigator({ share, canShare: () => true })
  const bytes = new TextEncoder().encode('%PDF-1.7\n')

  await sharePdf(bytes, '仕様書.pdf', nav)

  expect(share).toHaveBeenCalledTimes(1)
  const arg = share.mock.calls[0][0] as { files: File[]; title: string }
  expect(arg.title).toBe('仕様書.pdf')
  expect(arg.files).toHaveLength(1)
  expect(arg.files[0].name).toBe('仕様書.pdf')
  expect(arg.files[0].type).toBe('application/pdf')
  expect(arg.files[0].size).toBe(bytes.byteLength)
})

test('共有した中身が元のバイト列と一致する', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  const nav = fakeNavigator({ share, canShare: () => true })
  const bytes = new TextEncoder().encode('%PDF-1.7\nhello')

  await sharePdf(bytes, 'x.pdf', nav)

  const arg = share.mock.calls[0][0] as { files: File[] }
  const got = new Uint8Array(await arg.files[0].arrayBuffer())
  expect([...got]).toEqual([...bytes])
})

// 共有シートを閉じただけ = 正常系。エラー表示に出さない
test('AbortError は「中断」と判定する', () => {
  const aborted = Object.assign(new Error('cancelled'), { name: 'AbortError' })
  expect(isShareAborted(aborted)).toBe(true)
})

test('それ以外の失敗は中断ではない (握り潰さない)', () => {
  expect(isShareAborted(new Error('boom'))).toBe(false)
  expect(
    isShareAborted(Object.assign(new Error('x'), { name: 'NotAllowedError' })),
  ).toBe(false)
  expect(isShareAborted(null)).toBe(false)
  expect(isShareAborted('AbortError')).toBe(false)
})
