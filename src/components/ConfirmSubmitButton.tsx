"use client";

import type { ReactNode } from "react";

interface ConfirmSubmitButtonProps {
  children: ReactNode;
  // 押したときに出す確認文。番号と「元に戻せない」ことを含める
  confirmMessage: string;
  formAction: (formData: FormData) => void | Promise<void>;
  className?: string;
}

// 確認を挟む送信ボタン。取り返しのつかない操作 (永久削除・ゴミ箱を空にする)
// だけに使う (docs/12-ゴミ箱計画.md §5)。ゴミ箱行きは復元できるので挟まない。
//
// preventDefault で送信そのものを止める。React の form action は
// defaultPrevented なら action を実行しないため、これでサーバーへ行かない
// (MemoEditorInner のアップロード中ブロックと同じ仕掛け)。
export function ConfirmSubmitButton({
  children,
  confirmMessage,
  formAction,
  className = "",
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      formAction={formAction}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}
