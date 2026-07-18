import Link from "next/link";
import {
  emptyTrashAction,
  purgeItemsAction,
  restoreItemsAction,
} from "@/app/actions";
import { PageTransition } from "@/components/PageTransition";
import { TrashList } from "@/components/TrashList";
import { ACTION_LINK_CLASS } from "@/components/ui";
import { listTrashedItems } from "@/lib/items";

export const dynamic = "force-dynamic";

// ゴミ箱 (二段階削除の 2 段目。docs/12-ゴミ箱計画.md §5)。
// 検索対象外のノートをここだけで一覧し、復元か永久削除かを選ぶ。
export default async function TrashPage() {
  const rows = await listTrashedItems();

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">ゴミ箱</h1>
          <Link
            href="/"
            transitionTypes={["nav-back"]}
            className={ACTION_LINK_CLASS}
          >
            検索へ
          </Link>
        </div>

        <p className="text-gray-600">
          ゴミ箱のノートは検索に出ません。復元すると元どおり検索できます。
        </p>

        <TrashList
          rows={rows}
          restoreAction={restoreItemsAction}
          purgeAction={purgeItemsAction}
          emptyTrashAction={emptyTrashAction}
        />
      </div>
    </PageTransition>
  );
}
