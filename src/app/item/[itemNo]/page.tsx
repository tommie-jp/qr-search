import Link from "next/link";
import { notFound } from "next/navigation";
import { updateMemoAction } from "@/app/actions";
import { ItemTimestamps } from "@/components/ItemTimestamps";
import { getItem } from "@/lib/items";
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
            QR印刷
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

      <form action={updateMemoAction} className="space-y-3">
        <input type="hidden" name="itemNo" value={itemNo} />
        <textarea
          name="memo"
          rows={12}
          maxLength={10000}
          defaultValue={item?.memo ?? ""}
          placeholder="メモを入力して下さい。"
          autoFocus
          className="w-full rounded border border-gray-300 bg-white px-3 py-2 font-mono text-sm"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-6 py-2 font-medium text-white"
        >
          更新
        </button>
      </form>

      <ItemTimestamps item={item} />
    </div>
  );
}
