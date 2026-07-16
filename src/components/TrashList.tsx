import Link from "next/link";
import type { TrashedItem } from "@/lib/items";
import { formatJstDateTime } from "@/lib/datetime";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { ACTION_LINK_CLASS, DANGER_BUTTON_CLASS } from "./ui";

type TrashAction = (formData: FormData) => void | Promise<void>;

interface TrashListProps {
  rows: TrashedItem[];
  restoreAction: TrashAction;
  purgeAction: TrashAction;
  emptyTrashAction: TrashAction;
}

// ゴミ箱の一覧 (docs/12-ゴミ箱計画.md §5)。数件しか溜まらない前提で、
// 選択ではなく行ごとの「復元」「永久削除」にしている。
//
// 各行は 1 つの form で、既定の action は復元 (安全な方)。永久削除は
// formAction で上書きし、confirm を挟む。DB を引かないので静的にテストできる。
export function TrashList({
  rows,
  restoreAction,
  purgeAction,
  emptyTrashAction,
}: TrashListProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-gray-200 bg-white px-4 py-6 text-center text-gray-500">
        ゴミ箱は空です
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* 永久削除は itemNo を解放する。古いシールが別の部品を指しうるので、
          「部品もシールも処分済み」のときだけ押す操作だと明示する (§4) */}
      <p className="rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
        永久削除すると元に戻せません。その番号は新しいノートに再利用されるため、
        貼ってあるシールも処分してから削除してください。
      </p>

      <form className="flex justify-end">
        <ConfirmSubmitButton
          formAction={emptyTrashAction}
          confirmMessage={`ゴミ箱の ${rows.length} 件をすべて完全に削除します。元に戻せません。`}
          className={DANGER_BUTTON_CLASS}
        >
          ゴミ箱を空にする ({rows.length})
        </ConfirmSubmitButton>
      </form>

      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {rows.map((row) => (
          <li
            key={row.itemNo}
            className="flex items-baseline gap-3 px-4 py-1.5"
          >
            <Link
              href={`/item/${row.itemNo}`}
              transitionTypes={["nav-forward"]}
              className="shrink-0 font-mono font-bold"
            >
              #{row.itemNo}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/item/${row.itemNo}`}
                transitionTypes={["nav-forward"]}
                className="block truncate text-sm text-gray-600"
              >
                {row.summary || "(空のノート)"}
              </Link>
              <p className="mt-0.5 font-mono text-xs text-gray-500">
                削除: {formatJstDateTime(row.deletedAt)}
              </p>
            </div>
            <form className="flex shrink-0 items-center gap-1" action={restoreAction}>
              <input type="hidden" name="itemNo" value={row.itemNo} />
              <button type="submit" className={ACTION_LINK_CLASS}>
                復元
              </button>
              <ConfirmSubmitButton
                formAction={purgeAction}
                confirmMessage={`#${row.itemNo} を完全に削除します。元に戻せず、この番号は新しいノートに再利用されます。シールも処分済みですか?`}
                className={DANGER_BUTTON_CLASS}
              >
                永久削除
              </ConfirmSubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
