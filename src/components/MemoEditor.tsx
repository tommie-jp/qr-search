"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MEMO_INPUT_CLASS } from "./ui";

// CodeMirror 一式は重いので、エディタが実際に表示されるまで読み込まない
const MemoEditorInner = dynamic(() => import("./MemoEditorInner"), {
  ssr: false,
  loading: () => null,
});

interface MemoEditorProps {
  defaultValue: string;
  autoFocus?: boolean;
  minHeight?: string;
}

// markdown 用 memo エディタ。フォーム送信値は常にここの hidden input が持つため、
// CodeMirror の読み込み完了前に「更新」を押しても現在値がそのまま送信される
// (読み込み中に memo フィールドが欠けてデータが消えることはない)
export function MemoEditor({
  defaultValue,
  autoFocus = false,
  minHeight = "14rem",
}: MemoEditorProps) {
  const [value, setValue] = useState(defaultValue);
  const [isEditorReady, setIsEditorReady] = useState(false);

  return (
    <div className="space-y-2">
      <input type="hidden" name="memo" value={value} />
      {!isEditorReady && (
        <textarea
          readOnly
          rows={8}
          value={value}
          className={MEMO_INPUT_CLASS}
          placeholder="エディタを読み込み中…"
        />
      )}
      <MemoEditorInner
        value={value}
        onChange={setValue}
        onReady={() => setIsEditorReady(true)}
        autoFocus={autoFocus}
        minHeight={minHeight}
      />
    </div>
  );
}
