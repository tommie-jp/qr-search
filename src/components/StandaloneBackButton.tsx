"use client";

// ホーム画面から起動 (standalone) したときだけ出す戻るボタン
// (docs/11-アプリ的UIUX計画.md §5)。
//
// standalone にはブラウザの戻るボタンがなく、iOS では画面端スワイプしか
// 戻る手段がない (しかも初回は効かない)。ブラウザで開いているときは
// ブラウザ自身の戻るがあるので出さない。
//
// 表示の切り替えは CSS の display-mode メディアクエリでやる。JS で判定すると
// サーバ描画と食い違ってちらつくため (standalone 変体は globals.css で定義)
export function StandaloneBackButton() {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      aria-label="前の画面に戻る"
      className="hidden min-h-11 items-center rounded pr-2 text-lg text-gray-500 transition-colors active:bg-gray-100 standalone:inline-flex"
    >
      ←
    </button>
  );
}
