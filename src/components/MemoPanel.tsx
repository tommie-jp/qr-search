"use client";

import { useState, type ReactNode } from "react";

type MemoMode = "markdown" | "text" | "edit";

interface MemoPanelProps {
  defaultMode: MemoMode;
  markdownView: ReactNode;
  textView: ReactNode;
  // 省略 = 読み取り専用 (公開ビュー。docs/22-ノート公開計画.md §4)。
  // 編集タブごと出さない — /edit も Server Action も未ログインには閉じているので、
  // 押しても何も起きないタブを見せない
  editForm?: ReactNode;
}

const MODES: { key: MemoMode; label: string }[] = [
  { key: "markdown", label: "markdown" },
  { key: "text", label: "テキスト" },
  { key: "edit", label: "編集" },
];

// memo の表示切替タブ。中身 (markdownView / textView / editForm) は
// Server Component のまま slot として受け取る。
// パネルは「一度開いたら hidden で保持」: 開くまでマウントしないことで
// 重い中身 (CodeMirror, mermaid) の読み込みを遅延し、開いた後は
// unmount しないことで編集中の入力を保持する
export function MemoPanel({
  defaultMode,
  markdownView,
  textView,
  editForm,
}: MemoPanelProps) {
  const [mode, setMode] = useState<MemoMode>(defaultMode);
  const [visited, setVisited] = useState<ReadonlySet<MemoMode>>(
    () => new Set([defaultMode]),
  );

  const selectMode = (key: MemoMode) => {
    setMode(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  const panels: { key: MemoMode; content: ReactNode }[] = [
    { key: "markdown", content: markdownView },
    { key: "text", content: textView },
    ...(editForm === undefined
      ? []
      : [{ key: "edit" as const, content: editForm }]),
  ];

  // 読み取り専用なら編集タブは出さない (editForm 省略時)
  const modes = MODES.filter(
    ({ key }) => key !== "edit" || editForm !== undefined,
  );

  return (
    <div className="space-y-2">
      <div role="tablist" className="flex gap-1">
        {modes.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => selectMode(key)}
            className={`min-h-10 rounded-t border border-b-0 px-4 transition-colors ${
              mode === key
                ? "border-gray-300 bg-white font-medium text-blue-600"
                : "border-transparent bg-gray-100 text-gray-500 active:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {panels.map(
        ({ key, content }) =>
          visited.has(key) && (
            <div key={key} hidden={mode !== key}>
              {content}
            </div>
          ),
      )}
    </div>
  );
}
