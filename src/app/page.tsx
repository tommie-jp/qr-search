import Link from "next/link";
import { bulkTagAction } from "@/app/actions";
import { ItemList } from "@/components/ItemList";
import { PropsTable } from "@/components/PropsTable";
import { SearchForm } from "@/components/SearchForm";
import { listTags, searchItemProps, searchItems } from "@/lib/items";
import { queryHasTagTerm } from "@/lib/search";
import { buildSearchUrl } from "@/lib/searchUrl";
import { parseSort } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<{ q?: string; page?: string; sort?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q = "", page = "1", sort: sortParam } = await searchParams;
  const query = q.trim();
  const sort = parseSort(sortParam);
  // 特性表はタグ検索のときだけ出す。表は「同族の部品を並べて比べる」ビューで、
  // タグ検索がまさにその族の指定だから (docs/08-プロパティ計画.md §4)。
  const showProps = queryHasTagTerm(query);
  const [result, tags, props] = await Promise.all([
    searchItems(query, Number(page) || 1, sort),
    listTags(),
    showProps
      ? searchItemProps(query, sort)
      : Promise.resolve({ rows: [], omitted: 0 }),
  ]);

  return (
    <div className="space-y-4">
      <SearchForm initialQuery={query} tags={tags.map((t) => t.tag)} />

      <div className="flex items-center justify-between text-sm">
        <p className="flex items-baseline gap-2 text-gray-600">
          <span>
            {query ? `「${query}」の検索結果: ` : "すべて: "}
            {result.total} 件
          </span>
          <Link href="/docs/search" className="text-xs text-blue-600 underline">
            検索ヘルプ
          </Link>
        </p>
        <p className="flex gap-2">
          {sort === "itemNo" ? (
            <span className="font-bold">番号順</span>
          ) : (
            <Link href={buildSearchUrl(query, 1, "itemNo")} className="text-blue-600 underline">
              番号順
            </Link>
          )}
          {sort === "updated" ? (
            <span className="font-bold">更新順</span>
          ) : (
            <Link href={buildSearchUrl(query, 1, "updated")} className="text-blue-600 underline">
              更新順
            </Link>
          )}
        </p>
      </div>

      <PropsTable rows={props.rows} omitted={props.omitted} />

      <ItemList
        items={result.items}
        query={query}
        page={result.page}
        sort={sort}
        action={bulkTagAction}
      />

      <div className="flex items-center justify-between text-sm">
        {result.page > 1 ? (
          <Link
            href={buildSearchUrl(query, result.page - 1, sort)}
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
            href={buildSearchUrl(query, result.page + 1, sort)}
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
