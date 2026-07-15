import Link from "next/link";
import { notFound } from "next/navigation";
import { updateMemoAction } from "@/app/actions";
import { ItemTimestamps } from "@/components/ItemTimestamps";
import { MarkdownView } from "@/components/MarkdownView";
import { MemoPanel } from "@/components/MemoPanel";
import { MemoEditor } from "@/components/MemoEditor";
import { BOX_CLASS } from "@/components/ui";
import { getItem } from "@/lib/items";
import { renderCircuits } from "@/lib/circuitCache";
import { tagSearchHref } from "@/lib/tags";
import { isValidItemNo } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface ItemPageProps {
  params: Promise<{ itemNo: string }>;
}

// QR シールの飛び先。Ver1 と同じく未登録の itemNo でも開けて、
// その場で memo を書いて新規作成できる
export default async function ItemPage({ params }: ItemPageProps) {
  const { itemNo } = await params;
  if (!isValidItemNo(itemNo)) {
    notFound();
  }
  const item = await getItem(itemNo);
  const memo = item?.memo ?? "";
  // ```circuitikz は TeX (WASM) で描くため非同期。MarkdownView は同期に描くので
  // ここで済ませて結果を渡す (2 回目以降は DB キャッシュを引くだけ)
  const circuits = await renderCircuits(memo);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">
          item <span className="font-mono">#{itemNo}</span>
        </h1>
        <div className="flex gap-3 text-sm">
          <Link href={`/edit/${itemNo}`} className="text-blue-600 underline">
            編集
          </Link>
          <Link href={`/print/${itemNo}`} className="text-blue-600 underline">
            QR
          </Link>
          <Link href="/docs/memo" className="text-blue-600 underline">
            記法
          </Link>
        </div>
      </div>

      {!item && (
        <p className="rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          未登録の部品番号です。メモを保存すると新規登録されます。
        </p>
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
                className="inline-block rounded-full bg-gray-100 px-3 py-0.5 text-sm text-blue-700 hover:bg-gray-200"
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
            <input type="hidden" name="itemNo" value={itemNo} />
            <MemoEditor
              defaultValue={memo}
              minHeight="18rem"
              autoFocus={memo === ""}
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-6 py-2 font-medium text-white"
            >
              更新
            </button>
          </form>
        }
      />

      <ItemTimestamps item={item} />
    </div>
  );
}
