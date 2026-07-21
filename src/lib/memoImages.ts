// メモ本文に貼られた画像の参照を読む (docs/23-検索結果表示モード計画.md §4)。
//
// 画像とノートの関係は DB に無い。参照は本文に書かれた
// `/api/images/<UUID>.<ext>` という文字列だけである (docs/20-画像GC計画.md §1)。
// 一覧のサムネに「そのノートの画像」を出すには、本文を読むしかない。
//
// 検索は memo を丸ごと引いているので、ここは追加の問い合わせを呼ばない。
// 遅くなったら tags / props と同じく「保存時に計算する派生キャッシュ列」へ
// 移せる (そのときもこの関数が正本の抽出規則として残る)。

import { stripCode } from './tags'
import { isValidImageName } from './uploads'

// Markdown の画像記法 `![alt](url)` の url を捕捉する。
// リンク記法 `[text](url)` は先頭の `!` が無いので外れる — 貼った画像ではなく
// ただのリンクなので、サムネにする対象ではない。
const IMAGE_SYNTAX = /!\[[^\]]*\]\(([^)\s]+)\)/g

// 自前の画像だけを対象にする。外部の画像 (https://...) はサムネを持たないうえ、
// 一覧を開くだけで外部へ 20 本の要求が飛ぶことになるので拾わない。
const IMAGE_PATH_PREFIX = '/api/images/'

// 本文に貼られた自前画像の名前を出てくる順に列挙する。
// コードフェンス・インラインコードの中は対象外 (tags.ts / props.ts と同じ流儀)。
// firstImageName / allImageNames の共通の抽出規則。
function* iterImageNames(memo: string): Generator<string> {
  for (const match of stripCode(memo).matchAll(IMAGE_SYNTAX)) {
    const url = match[1]
    if (!url.startsWith(IMAGE_PATH_PREFIX)) {
      continue
    }
    // 書式の検算。名前は配信 URL に組み立てる値なので、本文から拾った文字列を
    // そのまま信じない (route.ts が 400 で弾く形と同じ線引きをここでも敷く)
    const name = url.slice(IMAGE_PATH_PREFIX.length)
    if (isValidImageName(name)) {
      yield name
    }
  }
}

// 本文に最初に現れる自前画像の名前 (`<UUID>.<ext>`)。無ければ null。
export function firstImageName(memo: string): string | null {
  for (const name of iterImageNames(memo)) {
    return name
  }
  return null
}

// 本文に貼られた自前画像の名前をすべて (出現順・重複除去) 返す。
// 画像検索の索引づくりで、1 ノートに複数枚ある写真を全部照合対象にするため
// 使う (docs/25-画像検索計画.md §4)。firstImageName と同じ抽出規則。
export function allImageNames(memo: string): string[] {
  const seen = new Set<string>()
  for (const name of iterImageNames(memo)) {
    seen.add(name)
  }
  return [...seen]
}

// サムネ生成パラメータ (thumbnail.ts) の版。パラメータを変えたら上げる。
//
// ?thumb=1 は 1 年 immutable でブラウザに焼かれる (route.ts の IMMUTABLE_CACHE)
// ため、DB の thumb を作り直しても URL が同じだと閲覧者には旧サムネが残る。
// URL に版を混ぜておけば、版を上げた瞬間に全参照が別 URL になりキャッシュを
// 割って新サムネを取り直す。route はこの値を読まない (thumb=1 だけを見る) ので
// 増やすだけでよい。v1: 長辺 320 inside → v2: 正方形 384 cover → v3: 384 inside
// (縦横比維持に戻す。画像モードのタイルを contain 全体表示に変えたため。docs/32 §1)
const THUMB_VERSION = 3

// 一覧のサムネ配信 URL。?thumb=1 は縮小版を返す
// (src/app/api/images/[name]/route.ts)。v はキャッシュバスター (上記)。
export function thumbUrl(name: string): string {
  return `${IMAGE_PATH_PREFIX}${name}?thumb=1&v=${THUMB_VERSION}`
}
