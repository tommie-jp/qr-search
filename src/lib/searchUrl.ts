import type { Sort } from './validation'

// 検索一覧 (/) の URL を組み立てる。既定値 (page=1 / sort=updated) は省略して
// 短い URL にする。一覧のページ送り・並び替えリンクと、一括操作後の戻り先で共用する。
export function buildSearchUrl(query: string, page: number, sort: Sort): string {
  const params = new URLSearchParams()
  if (query) {
    params.set('q', query)
  }
  if (page > 1) {
    params.set('page', String(page))
  }
  if (sort !== 'updated') {
    params.set('sort', sort)
  }
  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}
