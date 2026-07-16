"use client";

import Link from "next/link";
import { useState } from "react";
import type { Item } from "@/generated/prisma/client";
import type { Sort } from "@/lib/validation";
import { BulkTagToolbar } from "./BulkTagToolbar";
import { ItemRow } from "./ItemRow";
import { ACTION_LINK_CLASS, PRIMARY_BUTTON_CLASS } from "./ui";

// bulkTagAction をそのまま import すると db.ts (DATABASE_URL 必須) まで巻き込み
// テストが動かないため、サーバーアクションは page.tsx から prop で受け取る。
type BulkTagAction = (formData: FormData) => void | Promise<void>;

interface ItemListProps {
  items: Item[];
  // 一括操作後に戻る検索状態 (hidden で持ち回す)。
  query: string;
  page: number;
  sort: Sort;
  action: BulkTagAction;
  // 選択したノートをゴミ箱へ入れる (docs/12-ゴミ箱計画.md §5)
  trashAction: BulkTagAction;
  // 0 件の検索語をタグにした新規ノートの編集ページ。タグにできない語
  // (URL・複数語) や採番できないときは null。採番はサーバでしか引けないので
  // page.tsx から降ろす (docs/10-スキャン新規登録計画.md)
  registerHref: string | null;
  // 同じ検索条件でゴミ箱に当たった件数 (0 件検索のときだけサーバが数える)
  trashedMatches: number;
}

function emptyState(
  items: Item[],
  query: string,
  registerHref: string | null,
  trashedMatches: number,
) {
  if (items.length > 0) {
    return null;
  }
  return (
    <li className="space-y-3 px-4 py-6 text-center text-gray-500">
      <p>該当する部品がありません</p>
      {trashedMatches > 0 && (
        // 消したノートを探して 0 件のときと、ゴミ箱のノートと同じコードを
        // 再スキャンしたときの受け皿。復元は /trash 側で行う
        // (docs/12-ゴミ箱計画.md §5)
        <p>
          <Link
            href="/trash"
            transitionTypes={["nav-forward"]}
            className={`${ACTION_LINK_CLASS} justify-center`}
          >
            🗑 ゴミ箱に {trashedMatches} 件の一致があります
          </Link>
        </p>
      )}
      {registerHref && (
        // 何が作られるか (#コード) を見せる。押しても編集ページが開くだけで、
        // 「更新」を押すまで DB には何も書かない
        <p>
          <Link
            href={registerHref}
            transitionTypes={["nav-forward"]}
            className={`${PRIMARY_BUTTON_CLASS} px-4`}
          >
            <span className="font-mono">#{query}</span> を新規登録
          </Link>
        </p>
      )}
    </li>
  );
}

// 検索結果リスト。通常は今までどおりの表示 + 「選択」トグル。選択モードでは
// 各行にチェックボックス、上部に一括タグ付け/削除のツールバーを出す。
export function ItemList({
  items,
  query,
  page,
  sort,
  action,
  trashAction,
  registerHref,
  trashedMatches,
}: ItemListProps) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = (itemNo: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemNo)) {
        next.delete(itemNo);
      } else {
        next.add(itemNo);
      }
      return next;
    });

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const listClass =
    "divide-y divide-gray-200 rounded border border-gray-200 bg-white";

  if (!selectMode) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className={ACTION_LINK_CLASS}
          >
            選択
          </button>
        </div>
        <ul className={listClass}>
          {items.map((item) => (
            <ItemRow key={item.itemNo} item={item} />
          ))}
          {emptyState(items, query, registerHref, trashedMatches)}
        </ul>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="q" value={query} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="sort" value={sort} />
      <BulkTagToolbar
        items={items}
        selected={selected}
        trashAction={trashAction}
        onSelectAll={() => setSelected(new Set(items.map((i) => i.itemNo)))}
        onClear={() => setSelected(new Set())}
        onCancel={exitSelect}
      />
      <ul className={listClass}>
        {items.map((item) => (
          <ItemRow
            key={item.itemNo}
            item={item}
            checkbox={
              <input
                type="checkbox"
                name="itemNo"
                value={item.itemNo}
                checked={selected.has(item.itemNo)}
                onChange={() => toggle(item.itemNo)}
                aria-label={`#${item.itemNo} を選択`}
                className="size-4 shrink-0 self-center"
              />
            }
          />
        ))}
        {emptyState(items, query, null, 0)}
      </ul>
    </form>
  );
}
