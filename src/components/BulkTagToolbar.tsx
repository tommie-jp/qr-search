"use client";

import type { Item } from "@/generated/prisma/client";
import { selectedTagsUnion } from "@/lib/bulkTags";

interface BulkTagToolbarProps {
  items: Item[];
  selected: Set<string>;
  onSelectAll: () => void;
  onClear: () => void;
  onCancel: () => void;
}

// 選択モードのツールバー (親の <form action={bulkTagAction}> の中に置く)。
// 追加は入力欄 + 「追加」送信ボタン、削除は選択アイテムが持つタグをチップ
// (それ自体が送信ボタン name=removeTag) にして押されたタグだけを消す。
// どちらのボタンが押されたかでサーバー側が add / remove を判別する。
export function BulkTagToolbar({
  items,
  selected,
  onSelectAll,
  onClear,
  onCancel,
}: BulkTagToolbarProps) {
  const count = selected.size;
  const removable = selectedTagsUnion(items, selected);
  const disabled = count === 0;

  return (
    <div className="space-y-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{count} 件を選択中</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-blue-600 underline"
          >
            全選択
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-blue-600 underline"
          >
            解除
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-600 underline"
          >
            やめる
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          name="addTags"
          placeholder="追加するタグ (例: bjt npn)"
          autoComplete="off"
          disabled={disabled}
          className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={disabled}
          className="whitespace-nowrap rounded bg-blue-600 px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          追加
        </button>
      </div>

      {removable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-600">削除:</span>
          {removable.map((tag) => (
            <button
              key={tag}
              type="submit"
              name="removeTag"
              value={tag}
              className="rounded-full bg-white px-2 py-0.5 text-blue-700 ring-1 ring-inset ring-gray-300 hover:bg-red-50 hover:text-red-700 hover:ring-red-300"
            >
              #{tag} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
