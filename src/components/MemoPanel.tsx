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
    { key: "edit", content: editForm },
  ];

  return (
    <div className="space-y-2">
      <div role="tablist" className="flex gap-1 text-sm">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => selectMode(key)}
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
