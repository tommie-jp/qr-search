"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { MEMO_INPUT_CLASS } from "./ui";
import { type BookPrefillStatus, useBookPrefill } from "./useBookPrefill";

// CodeMirror 一式は重いので、エディタが実際に表示されるまで読み込まない
const MemoEditorInner = dynamic(() => import("./MemoEditorInner"), {
  ssr: false,
  loading: () => null,
});

// 書籍情報の取得は数秒かかることがあり (実機で確認)、無表示だと
// 「取得に失敗した」と見分けられない。取得中と結果をここで知らせる
// (docs/13-書誌自動取得計画.md §4)。
const BOOK_PREFILL_MESSAGE: Record<BookPrefillStatus, string> = {
  idle: "",
  loading: "書籍情報を取得中…",
  // 成功したときは書名が本文に出るので、文言では言わない
  loaded: "",
  skipped: "書籍情報を取得しましたが、編集中のため反映していません",
  notFound: "書籍情報が見つかりませんでした",
  error: "書籍情報の取得に失敗しました",
};

// 取得の状況。min-h で 1 行ぶんの高さを確保し、文言が消えるときに
// エディタが動かないようにする (打っている最中に入力欄がずれない)
function BookPrefillNotice({ status }: { status: BookPrefillStatus }) {
  const message = BOOK_PREFILL_MESSAGE[status];
  return (
    <p
      // 後から届く知らせなので、読み上げにも伝える
      aria-live="polite"
      aria-busy={status === "loading"}
      className={`flex min-h-5 items-center gap-2 text-sm ${
        status === "error" ? "text-red-700" : "text-gray-500"
      }`}
    >
      {status === "loading" && (
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500"
        />
      )}
      {message}
    </p>
  );
}

interface MemoEditorProps {
  defaultValue: string;
  autoFocus?: boolean;
  minHeight?: string;
  // 新規登録するコードが ISBN のときだけ渡す。書誌を openBD から引いて
  // defaultValue を差し替える (docs/13-書誌自動取得計画.md)
  isbn?: string;
}

// markdown 用 memo エディタ。フォーム送信値は常にここの hidden input が持つため、
// CodeMirror の読み込み完了前に「更新」を押しても現在値がそのまま送信される
// (読み込み中に memo フィールドが欠けてデータが消えることはない)
export function MemoEditor({
  defaultValue,
  autoFocus = false,
  minHeight = "14rem",
  isbn,
}: MemoEditorProps) {
  // 行末を LF に揃えてから渡す。DB には Ver1 由来の CRLF の本文があり、
  // CodeMirror は行末を LF として扱うので、素のまま渡すと「エディタの中身」と
  // この hidden input が初手から食い違う。すると @uiw/react-codemirror が
  // 差を埋めようと dispatch し、履歴に見えない 1 手が積まれてしまう
  // (何も編集していないのに「元に戻す」が押せ、押すと本文が dirty になる)。
  // どのみち 1 文字でも打てば LF に正規化されて保存されるので、最初から揃える
  const initialValue = useMemo(() => defaultValue.replace(/\r\n/g, "\n"), [defaultValue]);
  const [value, setValue] = useState(initialValue);
  const [isEditorReady, setIsEditorReady] = useState(false);

  // 書誌が届いたら本文を差し替える (まだ何も打っていなければ)。
  // 差し替えは CodeMirror の履歴に 1 手として積まれるので、要らなければ
  // 「元に戻す」で事前入力だけの状態に戻せる
  const bookPrefill = useBookPrefill({
    isbn,
    value,
    pristine: initialValue,
    setMemo: setValue,
  });

  return (
    <div className="space-y-2">
      <input type="hidden" name="memo" value={value} />
      {/* エディタの上に置く。スキャン直後に目が行くのは本文の先頭で、
          下に置くと見落とす */}
      {isbn && <BookPrefillNotice status={bookPrefill} />}
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
