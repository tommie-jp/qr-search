"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

// 画面下部の帯 (PageBottomBar) と、その中に編集ボタンを差し込む側
// (MemoEditorInner) をつなぐ context。
//
// 編集ボタンの状態・ハンドラは MemoEditorInner に残したまま、DOM の置き場所だけ
// 帯へ移したい (createPortal)。そのために「差し込み口の DOM」だけをこの context
// 経由で受け渡す。
//
// hostEl … 帯の中の差し込み口 (PageBottomBar が callback ref で登録する)。
// MemoEditorInner はここへ portal する。null の間は portal しない。編集中かどうかは
// 「portal が入っているか」がそのまま表すので、別途フラグは持たない。
interface BottomBarContextValue {
  hostEl: HTMLElement | null;
  // PageBottomBar が差し込み口の DOM を登録する callback ref。
  // state セッターなので、口が出来た瞬間に購読側が再描画される
  setHostEl: (el: HTMLElement | null) => void;
}

const BottomBarContext = createContext<BottomBarContextValue | null>(null);

export function BottomBarProvider({ children }: { children: ReactNode }) {
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ hostEl, setHostEl }), [hostEl]);

  return (
    <BottomBarContext.Provider value={value}>
      {children}
    </BottomBarContext.Provider>
  );
}

// Provider の外で使われたら握りつぶさず気付けるようにする。
// 下部バーは layout で全ページを包むので、通常は必ず内側にいる
export function useBottomBar(): BottomBarContextValue {
  const ctx = useContext(BottomBarContext);
  if (!ctx) {
    throw new Error("useBottomBar は BottomBarProvider の内側で使って下さい");
  }
  return ctx;
}
