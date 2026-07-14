import Link from "next/link";
import { BOX_CLASS } from "@/components/ui";
import { searchItems } from "@/lib/items";
import { memoSummary } from "@/lib/memoSummary";
import { parseSort, type Sort } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<{ q?: string; page?: string; sort?: string }>;
}

function pageHref(q: string, page: number, sort: Sort): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  if (sort !== "updated") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({ searchParams }: HomeProps) {
  const { q = "", page = "1", sort: sortParam } = await searchParams;
  const query = q.trim();
  const sort = parseSort(sortParam);
  const result = await searchItems(query, Number(page) || 1, sort);

  return (
    <div className="space-y-4">
      <form method="GET" action="/" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="部品番号・メモ・URL で検索"
          className={`w-full ${BOX_CLASS}`}
        />
        <button
          type="submit"
          className="whitespace-nowrap rounded bg-blue-600 px-4 py-2 font-medium text-white"
        >
          検索
        </button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <p className="text-gray-600">
          {query ? `「${query}」の検索結果: ` : "すべて: "}
          {result.total} 件
        </p>
        <p className="flex gap-2">
          {sort === "itemNo" ? (
            <span className="font-bold">番号順</span>
          ) : (
            <Link href={pageHref(query, 1, "itemNo")} className="text-blue-600 underline">
              番号順
            </Link>
          )}
          {sort === "updated" ? (
            <span className="font-bold">更新順</span>
          ) : (
            <Link href={pageHref(query, 1, "updated")} className="text-blue-600 underline">
              更新順
            </Link>
          )}
        </p>
      </div>

      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {result.items.map((item) => (
          <li key={item.itemNo}>
            <Link
              href={`/item/${item.itemNo}`}
              className="flex items-baseline gap-3 px-4 py-1.5 hover:bg-gray-50"
            >
              <span className="shrink-0 font-mono font-bold">
                #{item.itemNo}
              </span>
              <span className="truncate text-sm text-gray-600">
                {item.mode === "url" ? item.url : memoSummary(item.memo)}
              </span>
            </Link>
          </li>
        ))}
        {result.items.length === 0 && (
          <li className="px-4 py-6 text-center text-gray-500">
            該当する部品がありません
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between text-sm">
        {result.page > 1 ? (
          <Link
            href={pageHref(query, result.page - 1, sort)}
            className="text-blue-600 underline"
          >
            ← 前へ
          </Link>
        ) : (
          <span />
        )}
        <span className="text-gray-500">
          {result.page} / {result.pageCount} ページ
        </span>
        {result.page < result.pageCount ? (
          <Link
            href={pageHref(query, result.page + 1, sort)}
            className="text-blue-600 underline"
          >
            次へ →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
