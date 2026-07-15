import { expect, test } from 'vitest'
import { buildSearchUrl } from './searchUrl'

test('既定値 (page=1 / sort=updated) は省略する', () => {
  expect(buildSearchUrl('', 1, 'updated')).toBe('/')
  expect(buildSearchUrl('抵抗', 1, 'updated')).toBe('/?q=%E6%8A%B5%E6%8A%97')
})

test('page と sort が既定でなければ付ける', () => {
  expect(buildSearchUrl('bjt', 3, 'itemNo')).toBe('/?q=bjt&page=3&sort=itemNo')
})

test('クエリが空でも page/sort は付く', () => {
  expect(buildSearchUrl('', 2, 'updated')).toBe('/?page=2')
})
