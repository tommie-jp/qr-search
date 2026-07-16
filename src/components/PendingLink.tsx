"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

// 押した瞬間に回りだすスピナー。useLinkStatus は Link の子孫コンポーネントで
// しか pending を拾えないので分けている。レイアウトが動かないよう常に同じ
// 大きさで置き、opacity だけ切り替える (Next のドキュメントの推奨)
function LinkSpinner() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={`size-3 shrink-0 rounded-full border-2 border-current border-t-transparent transition-opacity ${
        pending ? "animate-spin opacity-100" : "opacity-0"
      }`}
    />
  );
}

// 遷移待ちが見えるリンク (docs/11-アプリ的UIUX計画.md §1-2)。
//
// loading.tsx を置いた / ・/item ・/edit への遷移は骨組みが即座に出るので
// 素の Link でよい。これを使うのは骨組みを持たない force-dynamic なページ
// (/print) と、同じルートの searchParams だけを変える遷移 (ページ送り・並び替え)
// のように、押してから画面が変わるまで何も起きない導線だけ。
export function PendingLink({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <LinkSpinner />
    </Link>
  );
}
