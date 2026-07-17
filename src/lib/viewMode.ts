// 検索結果の表示モード (docs/23-検索結果表示モード計画.md §1)。
//
//   compact (小) … 1 カラム。1 ノート 2 行 (タイトル / タグ) + 小さなサムネ。
//                  一覧して番号を拾う・ざっと眺めるための密な表示。
//   card    (大) … タイトル / タグ / 本文 3 行 + 大きめのサムネ。
//                  カラム数は画面幅が決める (スマホ 1 列 / PC 2 列以上)。
//
// **URL ではなく cookie に持つ**。sort やページ番号は「何を見ているか」なので
// URL が正 (docs/11-アプリ的UIUX計画.md §3) だが、表示モードは「どう見たいか」
// という端末ごとの好みで、検索状態ではない。URL に混ぜると:
//   - 共有したリンクに自分の好みが漏れ、相手の好みを上書きしてしまう
//   - スキャンやタグリンクで入るたびに既定へ戻る
//   - buildSearchUrl の呼び出し全部に引数が増える
// cookie ならサーバコンポーネントが描画前に読めるので、初回描画から正しい
// レイアウトで出る (localStorage だと一度描いてから跳ねる)。

export type ViewMode = 'compact' | 'card'

export const VIEW_MODE_COOKIE = 'view'

// 未設定・不正値のときの既定。今までの見た目 (2 行の一覧) を既定にすることで、
// この機能が入っても何もしていない人の画面は変わらない。
export const DEFAULT_VIEW_MODE: ViewMode = 'compact'

// cookie は利用者が自由に書き換えられる外部入力なので、素通しせず畳む
// (parseSort と同じ流儀)。
export function parseViewMode(value: unknown): ViewMode {
  return value === 'card' ? 'card' : DEFAULT_VIEW_MODE
}

// cookie の寿命 (秒)。1 年。好みなので、次に自分で変えるまで続くのが期待どおり。
export const VIEW_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
