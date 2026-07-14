"use client";

import { useState, type ReactNode } from "react";

type MemoMode = "markdown" | "text" | "edit";

interface MemoPanelProps {
  defaultMode: MemoMode;
  markdownView: ReactNode;
  textView: ReactNode;
  editForm: ReactNode;
}

const MODES: { key: MemoMode; label: string }[] = [
  { key: "markdown", label: "markdown" },
  { key: "text", label: "テキスト" },
  { key: "edit", label: "編集" },
];

// memo の表示切替タブ。中身 (markdownView / textView / editForm) は
// Server Component のまま slot として受け取る
export function MemoPanel({
  defaultMode,
  markdownView,
  textView,
  editForm,
}: MemoPanelProps) {
  const [mode, setMode] = useState<MemoMode>(defaultMode);

  return (
    <div className="space-y-2">
      <div role="tablist" className="flex gap-1 text-sm">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`rounded-t border border-b-0 px-4 py-1 ${
              mode === key
                ? "border-gray-300 bg-white font-medium text-blue-600"
                : "border-transparent bg-gray-100 text-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* 編集中の入力を失わないよう unmount せず hidden で切り替える */}
      <div hidden={mode !== "markdown"}>{markdownView}</div>
      <div hidden={mode !== "text"}>{textView}</div>
      <div hidden={mode !== "edit"}>{editForm}</div>
    </div>
  );
}
