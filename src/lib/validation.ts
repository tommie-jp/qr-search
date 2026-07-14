export type Mode = 'memo' | 'url'

// Ver1 の実データは 4 桁数字が大半だが、"100x" のような
// 非数字の itemNo も 1 件存在するため英数字を許容する
const ITEM_NO_PATTERN = /^[0-9A-Za-z_-]{1,20}$/

export function isValidItemNo(itemNo: string): boolean {
  return ITEM_NO_PATTERN.test(itemNo)
}

// DB の item_no_num 列は Int (int4) なので、その範囲を超える値は入れない
const INT4_MAX = 2147483647

// 一覧の数値ソート用。非数字・int4 範囲外の itemNo は null (末尾に表示)
export function itemNoToNum(itemNo: string): number | null {
  if (!/^[0-9]+$/.test(itemNo)) {
    return null
  }
  const num = Number(itemNo)
  return num <= INT4_MAX ? num : null
}

// Prisma の contains / startsWith は LIKE メタ文字をエスケープしないため、
// 検索語の % _ \ をエスケープする (PostgreSQL の LIKE の既定エスケープは \)
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// Ver1 は mode 未設定を "memo" として扱っていた (edit 画面の挙動)
export function parseMode(value: unknown): Mode {
  return value === 'url' ? 'url' : 'memo'
}

export type Sort = 'itemNo' | 'updated'

// 一覧の並び順。Ver1 の /search と同じく更新日降順を既定にする
export function parseSort(value: unknown): Sort {
  return value === 'itemNo' ? 'itemNo' : 'updated'
}

export function buildItemUrl(baseUrl: string, itemNo: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/item/${itemNo}`
}
