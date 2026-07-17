"use client";

import { LOGIN_PATH, loginHref } from "@/lib/loginRedirect";

interface LoginButtonProps {
  // ヘッダの中に置くか (小さい文字リンク)、案内の本文に置くか (主ボタン)
  variant?: "header" | "primary";
}

// ログインボタン (docs/18-ログイン計画.md)。
//
// 素の <a> で /login へ「普通に画面遷移」させるのが要点。router.push や fetch で
// 呼ぶと、401 を受け取ってもブラウザは認証ダイアログを出さない (JS から見た
// ただの失敗レスポンスになる)。ダイアログはブラウザ自身の画面遷移でしか出ない。
//
// 戻り先はクリック時に window.location から組む。サーバ側で組めないのは、
// root layout がパスを知らないため (proxy.ts が /item/ABC を /login-required へ
// rewrite するので、サーバから見えるパスは本人の居場所と一致しない)。
// href は最初から /login で描いておき、JS が載ったら戻り先を足す —
// こうすると描き直しでずれない (hydration mismatch にならない) し、
// JS が無くてもログインだけはできる (行き先が / になるだけ)。
export function LoginButton({ variant = "header" }: LoginButtonProps) {
  const className =
    variant === "header"
      ? "inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-blue-600 transition-colors active:bg-blue-50"
      : "inline-flex min-h-11 items-center justify-center gap-2 rounded bg-blue-600 px-6 font-medium text-white transition-transform active:scale-95";

  return (
    <a
      href={LOGIN_PATH}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        const here = window.location.pathname + window.location.search;
        // assign であってフレームワークの遷移ではない (上のコメント参照)
        window.location.href = loginHref(here);
      }}
    >
      ログイン
    </a>
  );
}
