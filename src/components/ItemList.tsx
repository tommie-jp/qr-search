import Link from "next/link";
import type { Item } from "@/generated/prisma/client";
import { memoSummary } from "@/lib/memoSummary";
import { tagSearchHref } from "@/lib/tags";

interface ItemListProps {
  items: Item[];
}

// 検索結果 / 一覧の各行。番号と要約は詳細ページへのリンク、
// その下にタグをタグ検索 (/?q=%23タグ) への青リンクとして揃えて表示する。
// タグ行を要約の下に揃えるため、番号を左カラム・(要約 + タグ) を右カラムに置く。
// タグリンクは行リンクの入れ子にできない (a の入れ子は不正) ため兄弟に並べる。
export function ItemList({ items }: ItemListProps) {
  return (
    <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
      {items.map((item) => (
        <li key={item.itemNo}>
          <div className="flex items-baseline gap-3 px-4 py-1.5 hover:bg-gray-50">
            <Link
              href={`/item/${item.itemNo}`}
              className="shrink-0 font-mono font-bold"
            >
              #{item.itemNo}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/item/${item.itemNo}`}
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
      ))}
      {items.length === 0 && (
        <li className="px-4 py-6 text-center text-gray-500">
          該当する部品がありません
        </li>
      )}
    </ul>
  );
}
