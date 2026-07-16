import Link from "next/link";
import { bulkTagAction } from "@/app/actions";
import { ItemList } from "@/components/ItemList";
import { PageTransition } from "@/components/PageTransition";
import { PendingLink } from "@/components/PendingLink";
import { PropsTable } from "@/components/PropsTable";
import { SearchForm } from "@/components/SearchForm";
import { SearchNavProvider, SearchResults } from "@/components/SearchNav";
import { ACTION_LINK_CLASS } from "@/components/ui";
import { listTags, nextItemNo, searchItemProps, searchItems } from "@/lib/items";
import { isTaggableCode, scanRegisterHref } from "@/lib/scanRegister";
import { queryHasTagTerm } from "@/lib/search";
import { buildSearchUrl } from "@/lib/searchUrl";
import { qrStickerHost } from "@/lib/site";
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

  // スキャンした未登録コードから新規ノートを作る導線
  // (docs/10-スキャン新規登録計画.md §3)。0 件かつタグにできる語のときだけ
  // 採番を引く。ヒットした検索や URL・複数語では引かない (無駄な問い合わせを
  // しないためと、ボタンを出さないため)
  const registerHref =
    result.total === 0 && isTaggableCode(query)
      ? scanRegisterHref(await nextItemNo(), query)
      : null;

  return (
    // 検索窓と結果をまとめて包み、打つそばからの URL 書き換えと待ち状態を
    // 共有する (docs/11-アプリ的UIUX計画.md §3)。
    // 以前ここにあった key={query} は外した。1 文字ごとの書き換えで
    // 作り直されるとフォーカスもキャレットも飛んでしまうため。外からの遷移
    // (スキャン・タグリンク) での窓の追従は SearchForm 側で面倒を見る。
    // stickerHost … シールに焼かれたホストは QR_BASE_URL 固定で、
    // アプリを開いているホスト (localhost 等) とは食い違いうる
    <SearchNavProvider sort={sort}>
      <PageTransition>
        <div className="space-y-4">
          <SearchForm
            initialQuery={query}
            tags={tags.map((t) => t.tag)}
            stickerHost={qrStickerHost()}
          />

          <SearchResults>
            <div className="flex items-center justify-between text-sm">
              <p className="flex items-baseline gap-2 text-gray-600">
                <span>
                  {query ? `「${query}」の検索結果: ` : "すべて: "}
                  {result.total} 件
                </span>
                <Link
                  href="/docs/search"
                  className="text-xs text-blue-600 underline"
                >
                  検索ヘルプ
                </Link>
              </p>
              {/* 並び替え・ページ送りは同じルートの searchParams だけを変える
                遷移で loading.tsx の骨組みが出ないため、リンク側でスピナーを出す */}
              <p className="flex gap-1">
                {sort === "itemNo" ? (
                  <span
                    className={`${ACTION_LINK_CLASS} font-bold text-gray-900`}
                  >
                    番号順
                  </span>
                ) : (
                  <PendingLink
                    href={buildSearchUrl(query, 1, "itemNo")}
                    className={ACTION_LINK_CLASS}
                  >
                    番号順
                  </PendingLink>
                )}
                {sort === "updated" ? (
                  <span
                    className={`${ACTION_LINK_CLASS} font-bold text-gray-900`}
                  >
                    更新順
                  </span>
                ) : (
                  <PendingLink
                    href={buildSearchUrl(query, 1, "updated")}
                    className={ACTION_LINK_CLASS}
                  >
                    更新順
                  </PendingLink>
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
              registerHref={registerHref}
            />

            <div className="flex items-center justify-between text-sm">
              {result.page > 1 ? (
                <PendingLink
                  href={buildSearchUrl(query, result.page - 1, sort)}
                  className={ACTION_LINK_CLASS}
                >
                  ← 前へ
                </PendingLink>
              ) : (
                <span />
              )}
              <span className="text-gray-500">
                {result.page} / {result.pageCount} ページ
              </span>
              {result.page < result.pageCount ? (
                <PendingLink
                  href={buildSearchUrl(query, result.page + 1, sort)}
                  className={ACTION_LINK_CLASS}
                >
                  次へ →
                </PendingLink>
              ) : (
                <span />
              )}
            </div>
          </SearchResults>
        </div>
      </PageTransition>
    </SearchNavProvider>
  );
}
