"use client";

import { useSyncExternalStore } from "react";
import { HEADER_MENU_ITEM_CLASS } from "@/components/ui";
import {
  isDebugConsoleOn,
  setDebugConsole,
  subscribeDebugConsole,
} from "@/lib/erudaConsole";

// メニューから eruda を出し入れする (docs/30-ブラウザログ計画.md §2)。
//
// ?debug=1 だけでも出せるが、iPhone のアドレス欄でクエリを手打ちするのは
// 苦行なので押せる場所を用意する。メニューはログイン中しか出ないため、
// ログイン前は手打ちになる — 頻度が低いので許す。
//
// 状態の正本は sessionStorage (React の外) なので useSyncExternalStore で読む。
// サーバでは読みようがないため、既定は「出ていない」— ここが食い違うと
// hydration が壊れる
// 虫のアイコン。行頭アイコンの作法 (currentColor の線画・aria-hidden) は
// MenuIcons.tsx と揃えてある
function BugIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6a3 3 0 0 1 6 0" />
      <rect x="7" y="8" width="10" height="12" rx="5" />
      <path d="M3 12h4M17 12h4M4 7l3 2M20 7l-3 2M4 18l3-2M20 18l-3-2" />
    </svg>
  );
}

export function DebugConsoleButton() {
  const isOn = useSyncExternalStore(
    subscribeDebugConsole,
    isDebugConsoleOn,
    () => false,
  );

  async function handleClick() {
    try {
      await setDebugConsole(!isOn);
    } catch (error) {
      // 握りつぶさない。読み込みに失敗したなら、押した本人がそれを知るべき
      // (この console.error は転送に乗って /logs に出る)
      console.error("デバッグコンソールを切り替えられませんでした", error);
    }
  }

  return (
    <button type="button" onClick={handleClick} className={HEADER_MENU_ITEM_CLASS}>
      <BugIcon />
      {isOn ? "デバッグを隠す" : "デバッグ"}
    </button>
  );
}
