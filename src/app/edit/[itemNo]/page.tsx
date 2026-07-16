import Link from "next/link";
import { notFound } from "next/navigation";
import { updateItemAction } from "@/app/actions";
import { ItemTimestamps } from "@/components/ItemTimestamps";
import { MemoEditor } from "@/components/MemoEditor";
import { PageTransition } from "@/components/PageTransition";
import { SubmitButton } from "@/components/SubmitButton";
import { UnsavedGuard } from "@/components/UnsavedGuard";
import {
  ACTION_LINK_CLASS,
  MEMO_INPUT_CLASS,
  STICKY_ACTIONS_CLASS,
} from "@/components/ui";
import { getItem } from "@/lib/items";
import { isTaggableCode, scanRegisterMemo } from "@/lib/scanRegister";
import { isValidItemNo } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface EditPageProps {
  params: Promise<{ itemNo: string }>;
  searchParams: Promise<{ code?: string }>;
}

// Ver1 の /edit/:itemNo 相当。mode / memo / url をまとめて編集する
export default async function EditPage({ params, searchParams }: EditPageProps) {
  const { itemNo } = await params;
  if (!isValidItemNo(itemNo)) {
    notFound();
  }
  const [item, { code }] = await Promise.all([getItem(itemNo), searchParams]);
  const mode = item?.mode ?? "memo";

  // スキャンした未登録コードからの新規登録 (docs/10-スキャン新規登録計画.md §5)。
  // 既存ノートには効かせない。採番が競合して先に使われていた場合、既存の本文を
  // 黙って上書きする初期値を出すと、そのまま更新して壊しかねない。
  // タグにできない code は無視する (通常の導線では来ない。URL を手で触った場合)
  const defaultMemo =
    !item && code && isTaggableCode(code) ? scanRegisterMemo(code) : (item?.memo ?? "");

  return (
    <PageTransition>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">
          edit <span className="font-mono">#{itemNo}</span>
        </h1>

        <form action={updateItemAction} className="space-y-3">
          <UnsavedGuard />
          <input type="hidden" name="itemNo" value={itemNo} />

          <fieldset className="flex gap-6">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="memo"
                defaultChecked={mode === "memo"}
                className="size-4"
              />
              メモ
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="url"
                defaultChecked={mode === "url"}
                className="size-4"
              />
              URL
            </label>
          </fieldset>

          <MemoEditor defaultValue={defaultMemo} autoFocus />
          <textarea
            name="url"
            rows={3}
            maxLength={10000}
            defaultValue={item?.url ?? ""}
            placeholder="URLを入力して下さい。"
            className={MEMO_INPUT_CLASS}
          />
          {/* 長い本文でも下までスクロールせずに保存できるよう画面下に貼り付ける */}
          <div className={STICKY_ACTIONS_CLASS}>
            <SubmitButton>更新</SubmitButton>
          </div>
        </form>

        <ItemTimestamps item={item} />

        <div className="flex gap-1 text-sm">
          <Link
            href={`/item/${itemNo}`}
            className={ACTION_LINK_CLASS}
            transitionTypes={["nav-back"]}
          >
            表示へ
          </Link>
          <Link href="/" className={ACTION_LINK_CLASS} transitionTypes={["nav-back"]}>
            一覧へ
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}
