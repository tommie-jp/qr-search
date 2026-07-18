"use client";

import { useState } from "react";
import { LOGOUT_PATH } from "@/lib/authPaths";

// ログアウト (docs/29-パスキー計画.md §4)。
//
// **セッションで入っているときだけ出す** (layout.tsx が canLogOut() で判断)。
// Basic 認証で入っている人には出さない — 資格情報を握っているのはブラウザで、
// サーバから忘れさせる手段がないため、押しても何も起きないボタンになる。
//
// 成功したら location.reload で描き直す。Cookie が消えた状態のヘッダ
// (ログインボタンが出る形) をサーバから貰い直す必要がある。
export function LogoutButton() {
  const [isBusy, setIsBusy] = useState(false);

  async function handleClick() {
    setIsBusy(true);
    try {
      const response = await fetch(LOGOUT_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(`ログアウトに失敗しました (${response.status})`);
      }
      window.location.reload();
    } catch (error) {
      // 握りつぶさない。「押したのに入ったまま」の原因を追えるようにする
      console.error("ログアウトに失敗しました", error);
      setIsBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isBusy}
      className="inline-flex min-h-11 items-center rounded px-2 text-gray-500 transition-colors hover:text-gray-900 active:bg-gray-100 disabled:opacity-60"
    >
      {isBusy ? "処理中…" : "ログアウト"}
    </button>
  );
}
