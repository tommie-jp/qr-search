// ページ間で共有する枠・入力欄・ボタンの Tailwind クラス。
// メモの markdown 表示 / テキスト表示 / 入力欄で見た目を揃える

export const BOX_CLASS = "rounded border border-gray-300 bg-white px-3 py-2";

export const MEMO_INPUT_CLASS = `w-full ${BOX_CLASS} font-mono text-base`;

// 以下、押した感とタップ領域のための共有クラス (docs/11-アプリ的UIUX計画.md §1-4)。
// min-h-11 = 44px は指で狙える最小の大きさ。active: で押した瞬間に反応を返す
// (サーバ応答を待つ間、無反応に見えるのを防ぐ)

// 主ボタン (更新など)
export const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded bg-blue-600 px-6 font-medium text-white transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100";

// 副ボタン (スキャン・画像挿入など)
export const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded border border-gray-300 bg-white px-3 font-medium text-gray-700 transition active:scale-95 active:bg-gray-100 disabled:opacity-50 disabled:active:scale-100";

// 操作リンク (編集 / QR / 記法 / ページ送りなど)。素の下線リンクは指で狙いにくい
export const ACTION_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded px-2 text-sm text-blue-600 transition-colors active:bg-blue-50";

// 編集フォームの下端に貼り付くボタン行 (docs/11-アプリ的UIUX計画.md §2-1)。
// 長い本文でも一番下までスクロールせずに保存できる。
// bottom-0 は画面の下端なので、ホームバーに潜らないよう自前で余白を持つ
// (main の pb-safe は sticky には効かない)。bg は body と同じ gray-50
export const STICKY_ACTIONS_CLASS =
  "sticky bottom-0 z-10 flex items-center gap-3 bg-gray-50/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur";
