import Link from "next/link";
import type { ReactNode } from "react";
import type { Item } from "@/generated/prisma/client";
import { memoSummary } from "@/lib/memoSummary";
import { tagSearchHref } from "@/lib/tags";

interface ItemRowProps {
  item: Item;
  // 選択モードで先頭に差し込むチェックボックス (通常時は undefined)。
  checkbox?: ReactNode;
}

// 検索結果 / 一覧の 1 行。番号と要約は詳細ページへのリンク、その下にタグを
// タグ検索への青リンクとして揃えて表示する (要約列の下に整列)。
export function ItemRow({ item, checkbox }: ItemRowProps) {
  return (
    <li>
      <div className="flex items-baseline gap-3 px-4 py-1.5 transition-colors hover:bg-gray-50 active:bg-gray-100">
        {checkbox}
        <Link
          href={`/item/${item.itemNo}`}
          transitionTypes={["nav-forward"]}
          className="shrink-0 font-mono font-bold"
        >
          #{item.itemNo}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/item/${item.itemNo}`}
            transitionTypes={["nav-forward"]}
            className="block truncate text-sm text-gray-600"
          >
            {item.mode === "url" ? item.url : memoSummary(item.memo)}
          </Link>
          {item.tags.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
              {item.tags.map((tag) => (
                <Link
                  key={tag}
                  href={tagSearchHref(tag)}
                  className="text-xs text-blue-700 hover:underline"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
