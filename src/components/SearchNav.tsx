"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { buildSearchUrl } from "@/lib/searchUrl";
import type { Sort } from "@/lib/validation";

interface SearchNav {
  // 検索語を URL に反映する (結果はサーバが返す)
  navigate: (query: string) => void;
  // 反映待ち。結果一覧が古いことを示すのに使う
  isPending: boolean;
}

const SearchNavContext = createContext<SearchNav | null>(null);

export function useSearchNav(): SearchNav {
  const context = useContext(SearchNavContext);
  if (!context) {
    throw new Error("useSearchNav は SearchNavProvider の中で使う");
  }
  return context;
}

// 検索窓と結果一覧をまとめて包み、URL の書き換えと待ち状態を共有する
// (docs/11-アプリ的UIUX計画.md §3)。
//
// 「URL が正」は変えない。replace なので 1 文字ごとに履歴が増えることはなく、
// 共有・再読込・戻るは今までどおり動く。scroll: false … 打つたびに先頭へ
// 飛ばされないように。
export function SearchNavProvider({
  sort,
  children,
}: {
  sort: Sort;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (query: string) => {
      startTransition(() => {
        router.replace(buildSearchUrl(query.trim(), 1, sort), { scroll: false });
      });
    },
    [router, sort],
  );

  return (
    <SearchNavContext.Provider value={{ navigate, isPending }}>
      {children}
    </SearchNavContext.Provider>
  );
}

// 反映待ちの間、結果を薄くして「今出ているのは古い結果」と伝える。
// 中身 (件数・特性表・一覧・ページ送り) は Server Component のまま children で受ける。
//
// className … カード表示のとき結果エリアだけを広げるため (WIDE_RESULTS_CLASS)。
// 件数・特性表・一覧・ページ送りが揃って広がらないと、幅が食い違って見える
export function SearchResults({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isPending } = useSearchNav();

  return (
    <div
      aria-busy={isPending}
      className={`space-y-2 transition-opacity ${isPending ? "opacity-50" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
