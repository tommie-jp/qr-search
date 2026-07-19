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
  "inline-flex min-h-11 items-center gap-1.5 rounded px-2 text-blue-600 transition-colors active:bg-blue-50";

// 時間のかかる準備・処理中の知らせ (OCR、画像検索のモデル準備、書誌取得など)。
// 灰色の小さな文字だと埋もれて「固まった」と誤解されるため、赤背景で統一して
// 目立たせる。置き場所ごとのレイアウト (flex / absolute) は使う側で足す
export const BUSY_NOTICE_CLASS =
  "rounded bg-red-600/90 px-3 py-2 font-medium text-white";

// BUSY_NOTICE_CLASS の中に置くスピナー (赤背景に合わせた白系)
export const BUSY_SPINNER_CLASS =
  "size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white";

// ヘッダーのハンバーガーメニューの 1 行 (docs/11-アプリ的UIUX計画.md §6)。
//
// 行そのものをタップ領域にする (w-full + min-h-11)。文字だけを的にすると、
// メニューという「狙って押す場所」で指を外しやすい。
// リンクもボタンも同じ見た目にするため、両方からこれを使う
export const HEADER_MENU_ITEM_CLASS =
  "flex min-h-11 w-full items-center rounded px-3 text-left font-medium text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200";

// 破壊的な操作 (ゴミ箱へ / 永久削除)。赤は「戻せないかもしれない」の合図で、
// 押す前に一拍置かせる。枠は持たせない (主ボタンと同格に見せない)
export const DANGER_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-1 rounded px-3 font-medium text-red-700 transition-colors hover:bg-red-50 active:bg-red-100 disabled:opacity-50 disabled:hover:bg-transparent";

// カード表示のとき、検索結果エリアだけを画面の広い側へはみ出させる
// (docs/23-検索結果表示モード計画.md §1)。
//
// アプリの器は main の max-w-2xl (672px) で、これはメモの本文が読める行長に
// 収めるための意図的な設計。だがカードのグリッドはその制約の対象ではなく、
// 672px のままだと 320px 幅のカードが 2 つ入らず、PC でも永久に 1 カラムになる
// (実測: ul は 640px で、2 カラムに 8px 足りない)。
//
// 仕組み: left-1/2 で親の中心まで送り、-translate-x-1/2 で自分の幅の半分だけ
// 戻す。親と自分の幅を知らなくても中心が揃うので、main の幅を変えても壊れない。
//
// 100vw ではなく calc(100vw-4rem) なのは、100vw が縦スクロールバーの幅を含み、
// そのままだと横スクロールバーが出るため。4rem の余白がそれを吸収する。
//
// lg: 以上に限るのは、狭い画面でこれをやる意味がないから。スマホは元から
// 1 カラムで、はみ出させる余白も無い
export const WIDE_RESULTS_CLASS =
  "lg:relative lg:left-1/2 lg:w-[calc(100vw-4rem)] lg:max-w-6xl lg:-translate-x-1/2";

// 編集フォームの下端に貼り付くボタン行 (docs/11-アプリ的UIUX計画.md §2-1)。
// 長い本文でも一番下までスクロールせずに保存できる。
// bottom-0 は画面の下端なので、ホームバーに潜らないよう自前で余白を持つ
// (main の pb-safe は sticky には効かない)。bg は body と同じ gray-50
export const STICKY_ACTIONS_CLASS =
  "sticky bottom-0 z-10 flex items-center gap-3 bg-gray-50/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur";
