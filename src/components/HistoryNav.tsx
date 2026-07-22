"use client";

import { useSyncExternalStore } from "react";

// ヘッダーのハンバーガーの右に置く「戻る (←)」「進む (→)」ボタン
// (docs/11-アプリ的UIUX計画.md §5)。
//
// もとは standalone (ホーム画面起動) のときだけ出す ← 一本だった。standalone は
// ブラウザの戻るがなく iOS では画面端スワイプ頼み (しかも初回は効かない) なため。
// いまはブラウザで開いたときも含め ← → を常時出す。使えない向き (戻る/進む先が
// ない) はボタンを disabled にして薄く見せる。
//
// 使える/使えないの判定は Navigation API (navigation.canGoBack/canGoForward) で行う。
// Chrome/Edge 102+・Firefox 147+・Safari 26.2+ が対応。未対応ブラウザでは判定できない
// ので両方 active に倒す (押しても行き先がなければ no-op で無害)。
//
// サーバ描画時とクライアント初回では可否が分からないので、外部システム (Navigation
// API) の購読は useSyncExternalStore で行う。サーバ側 (getServerSnapshot) は常に
// false を返し、ハイドレーション後にクライアント側の実値へ差し替わる。

// TS の lib.dom.d.ts にはまだ Navigation API が無いので、使う分だけ最小宣言する。
interface NavigationApi extends EventTarget {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

function getNavigation(): NavigationApi | null {
  if (typeof window === "undefined" || !("navigation" in window)) return null;
  return (window as unknown as { navigation: NavigationApi }).navigation;
}

// 遷移のたびに現在地が変わり、戻る/進む先の有無も変わる。currententrychange で購読する
function subscribe(onChange: () => void): () => void {
  const navigation = getNavigation();
  if (!navigation) return () => {};
  navigation.addEventListener("currententrychange", onChange);
  return () => navigation.removeEventListener("currententrychange", onChange);
}

// getSnapshot は参照が安定した値 (ここでは boolean) を返す必要がある。
// 向きごとに 1 つずつ購読する
function useCanGo(direction: "back" | "forward"): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      const navigation = getNavigation();
      // 未対応ブラウザ: 判定できないので押せるままにしておく
      if (!navigation) return true;
      return direction === "back"
        ? navigation.canGoBack
        : navigation.canGoForward;
    },
    // サーバ描画・ハイドレーション時は可否不明なので disabled 側に倒す
    () => false,
  );
}

// -mb-3 + min-h-11 の意図は HeaderMenu のボタンと同じ (帯を低く見せつつ 44px を保つ)。
const BUTTON_CLASS =
  "inline-flex -mb-3 min-h-11 items-center rounded px-1.5 text-lg text-gray-500 transition-colors active:bg-gray-100 disabled:text-gray-300 disabled:active:bg-transparent";

export function HistoryNav() {
  const canGoBack = useCanGo("back");
  const canGoForward = useCanGo("forward");

  return (
    <>
      <button
        type="button"
        onClick={() => window.history.back()}
        disabled={!canGoBack}
        aria-label="前の画面に戻る"
        className={BUTTON_CLASS}
      >
        ←
      </button>
      <button
        type="button"
        onClick={() => window.history.forward()}
        disabled={!canGoForward}
        aria-label="次の画面に進む"
        className={BUTTON_CLASS}
      >
        →
      </button>
    </>
  );
}
