import Link from "next/link";
import { notFound } from "next/navigation";
import { restoreItemsAction, updateMemoAction } from "@/app/actions";
import { ItemTimestamps } from "@/components/ItemTimestamps";
import { MarkdownView } from "@/components/MarkdownView";
import { MemoPanel } from "@/components/MemoPanel";
import { MemoEditor } from "@/components/MemoEditor";
import { PageTransition } from "@/components/PageTransition";
import { PendingLink } from "@/components/PendingLink";
import { SavedToast } from "@/components/SavedToast";
import { SubmitButton } from "@/components/SubmitButton";
import { TrashedBanner } from "@/components/TrashedBanner";
import { UnsavedGuard } from "@/components/UnsavedGuard";
import { ACTION_LINK_CLASS, BOX_CLASS, STICKY_ACTIONS_CLASS } from "@/components/ui";
import { getItem } from "@/lib/items";
import { renderCircuits } from "@/lib/circuitCache";
import { tagSearchHref } from "@/lib/tags";
import { isValidItemNo } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface ItemPageProps {
  params: Promise<{ itemNo: string }>;
  // saved … 更新直後だけ付く保存時刻。トーストを出す印 (docs/11 §2-3)
  searchParams: Promise<{ saved?: string }>;
}

// QR シールの飛び先。Ver1 と同じく未登録の itemNo でも開けて、
// その場で memo を書いて新規作成できる
export default async function ItemPage({ params, searchParams }: ItemPageProps) {
  const { itemNo } = await params;
  if (!isValidItemNo(itemNo)) {
    notFound();
  }
  const [item, { saved }] = await Promise.all([getItem(itemNo), searchParams]);
  const memo = item?.memo ?? "";
  // ```circuitikz は TeX (WASM) で描くため非同期。MarkdownView は同期に描くので
  // ここで済ませて結果を渡す (2 回目以降は DB キャッシュを引くだけ)
  const circuits = await renderCircuits(memo);

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">
            item <span className="font-mono">#{itemNo}</span>
          </h1>
          <div className="flex gap-1 text-sm">
            <Link
              href={`/edit/${itemNo}`}
              className={ACTION_LINK_CLASS}
              transitionTypes={["nav-forward"]}
            >
              編集
            </Link>
            {/* /print は loading.tsx を持たない force-dynamic なページなので、
                押してから画面が変わるまでの間はリンク側でスピナーを出す */}
            <PendingLink
              href={`/print/${itemNo}`}
              className={ACTION_LINK_CLASS}
              transitionTypes={["nav-forward"]}
            >
              QR
            </PendingLink>
            <Link
              href="/docs/memo"
              className={ACTION_LINK_CLASS}
              transitionTypes={["nav-forward"]}
            >
              記法
            </Link>
          </div>
        </div>

        {saved && <SavedToast key={saved} />}

        {!item && (
          <p className="rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            未登録の部品番号です。メモを保存すると新規登録されます。
          </p>
        )}

        {item?.deletedAt && (
          <TrashedBanner itemNo={itemNo} restoreAction={restoreItemsAction} />
        )}

        {item && item.url && (
          <p className="rounded bg-blue-50 px-3 py-2 text-sm">
            URL:{" "}
            <a
              href={item.url}
              className="break-all text-blue-600 underline"
              rel="noreferrer"
            >
              {item.url}
            </a>
          </p>
        )}

        {item && item.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={tagSearchHref(tag)}
                  transitionTypes={["nav-back"]}
                  className="inline-flex min-h-9 items-center rounded-full bg-gray-100 px-3 text-sm text-blue-700 transition-colors hover:bg-gray-200 active:bg-gray-300"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* key: item 間のソフトナビゲーションでタブ選択状態を持ち越さない */}
        <MemoPanel
          key={itemNo}
          defaultMode={memo ? "markdown" : "edit"}
          markdownView={<MarkdownView markdown={memo} circuits={circuits} />}
          textView={
            <pre
              className={`whitespace-pre-wrap break-words ${BOX_CLASS} font-mono text-base`}
            >
              {memo}
            </pre>
          }
          editForm={
            <form action={updateMemoAction} className="space-y-3">
              <UnsavedGuard />
              <input type="hidden" name="itemNo" value={itemNo} />
              <MemoEditor
                defaultValue={memo}
                minHeight="18rem"
                autoFocus={memo === ""}
              />
              <div className={STICKY_ACTIONS_CLASS}>
                <SubmitButton>更新</SubmitButton>
              </div>
            </form>
          }
        />

        <ItemTimestamps item={item} />
      </div>
    </PageTransition>
  );
}
