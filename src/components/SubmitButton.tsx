"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PRIMARY_BUTTON_CLASS } from "./ui";

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}

// 送信中を表示する送信ボタン (docs/11-アプリ的UIUX計画.md §1-1)。
// 全ページ force-dynamic でサーバ応答を待つため、押しても無反応に見えていた。
//
// useFormStatus は form の子孫コンポーネントでしか pending を拾えないので、
// ページ (Server Component) からこのボタンだけを client component に切り出す。
// disabled が二重送信も止める。
//
// MemoEditorInner の「アップロード中は submit を preventDefault」とは独立に動く。
// React の form action は defaultPrevented なら action を実行しないため、
// ブロックされた送信でここが pending のまま固まることはない。
export function SubmitButton({
  children,
  pendingLabel = "更新中です…",
  className = "",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${PRIMARY_BUTTON_CLASS} ${className}`}
    >
      {pending && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}
