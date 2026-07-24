"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useBottomBar } from "@/components/BottomBarContext";
import {
  BOTTOM_BAR_CLASS,
  BOTTOM_BAR_INNER_CLASS,
  BOTTOM_BAR_SPACER_CLASS,
} from "@/components/ui";

// 画面下部の操作バーの左端に置く「戻る (←)」「進む (→)」ボタン
// (docs/11-アプリ的UIUX計画.md §5)。もとはヘッダーのハンバーガーの右に
// 置いていたが、下部バーの左へ移した — 片手持ちの親指は上端より下端に届く。
//
// 検索 (ホーム) 画面では BottomActionBar が中身に <HistoryNav /> を並べる。
// それ以外のページには BottomActionBar が無いので、下部バー (PageBottomBar)
// をレイアウトから全ページに敷き、その左端に ← → を置いて導線を保つ。
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

// 下部バーの左端に置く。他スロット (BOTTOM_BAR_SLOT_CLASS) は flex-1 で
// 等幅に伸びるが、← → は幅を占めず矢印だけの正方形に近い的にする。
// 親 (BOTTOM_BAR_INNER_CLASS) が items-stretch なので高さは帯に追従する。
const BUTTON_CLASS =
  "flex min-h-11 items-center justify-center rounded px-2.5 text-xl text-gray-500 transition-colors active:bg-gray-200/70 disabled:text-gray-300 disabled:active:bg-transparent";

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

// BottomActionBar (検索画面) 以外の全ページに敷く下部バー。
//
// 左端は常に ← → (戻る/進む) で導線を残す。その右に「差し込み口」を置き、
// ノート編集中は MemoEditorInner が編集ボタン (更新・元に戻す…) をここへ
// portal する (docs/31 の続き)。編集していないページでは差し込み口は空なので
// ← → だけの最小バーになる。
//
// ホーム (検索画面, パス "/") は BottomActionBar が自前で ← → を持つので、
// ここでは描かない (二重帯を避ける)。判定はクライアントの usePathname で行う —
// レイアウトはサーバコンポーネントで現在パスを知らない。
export function PageBottomBar({ isProd }: { isProd: boolean }) {
  const pathname = usePathname();
  // 差し込み口の DOM を context に登録する。編集側 (MemoEditorInner) はこれを
  // 読んで portal する。callback ref を使うと、口が出来た瞬間に購読側へ伝わる
  const { setHostEl } = useBottomBar();
  if (pathname === "/") return null;

  return (
    <>
      {/* バーぶんの余白。これがないとページ末尾がバーに隠れる
          (BottomActionBar と同じ理由)。編集帯もツールスロットが min-h-11 で
          高さは同じなので、余白は 1 種類で足りる */}
      <div aria-hidden className={BOTTOM_BAR_SPACER_CLASS} />

      <nav
        aria-label="ページ移動"
        className={`${BOTTOM_BAR_CLASS} ${
          isProd ? "border-gray-200 bg-white/95" : "border-pink-300 bg-pink-100/95"
        }`}
      >
        <div className={BOTTOM_BAR_INNER_CLASS}>
          <HistoryNav />
          {/* 編集ボタンの差し込み口。編集中でなければ空 (幅だけ確保して
              ← → を左に寄せる)。min-w-0 で中の横スクロール帯が縮められる */}
          <div ref={setHostEl} className="flex min-w-0 flex-1 items-stretch" />
        </div>
      </nav>
    </>
  );
}
