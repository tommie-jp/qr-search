"use client";

import { useState } from "react";
import { loginWithPasskey, PasskeyCancelledError } from "@/lib/passkeyClient";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";

interface PasskeyLoginButtonProps {
  // ヘッダの中に置くか (小さい文字リンク)、案内の本文に置くか (主ボタン)
  variant?: "header" | "primary";
}

// パスキーでログインするボタン (docs/29-パスキー計画.md §8)。
//
// LoginButton (Basic 認証) と対になる。あちらは「素の <a> で画面遷移する」
// ことが要点だったが、こちらは逆に **JS から呼ばなければ始まらない** —
// navigator.credentials.get() はブラウザの API であって、URL を開いて
// 出せるものではない。だからこれはクライアントコンポーネント。
//
// 成功したらページを丸ごと読み込み直す (router.refresh ではなく
// location.reload)。Cookie が付いた状態でサーバから描き直す必要があり、
// しかも今いる画面は proxy.ts に /login-required へ rewrite された結果
// かもしれない — その場合 refresh では中身が戻らない。
export function PasskeyLoginButton({
  variant = "header",
}: PasskeyLoginButtonProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const className =
    variant === "header"
      ? "inline-flex min-h-11 items-center rounded px-2 font-medium text-blue-600 transition-colors active:bg-blue-50 disabled:opacity-60"
      : PRIMARY_BUTTON_CLASS;

  async function handleClick() {
    setError(null);
    setIsBusy(true);
    try {
      await loginWithPasskey();
      window.location.reload();
      // reload は即座には効かないので、ここで止めて二度押しを防ぐ
      return;
    } catch (cause) {
      if (cause instanceof PasskeyCancelledError) {
        // 自分でやめた操作。黙って元に戻す (赤い字で叱らない)
        setIsBusy(false);
        return;
      }
      setError(cause instanceof Error ? cause.message : "ログインできませんでした");
      setIsBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        className={className}
      >
        {/* 共有のスピナー (BUSY_SPINNER_CLASS) は赤背景用の白なので、
            白地のここでは見えない。文字で状態を出す */}
        {isBusy ? "ログイン中…" : "パスキーでログイン"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
