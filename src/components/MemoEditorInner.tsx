"use client";

import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { fenceLanguageCompletion } from "./fenceCompletion";
import { fenceLanguageLinter } from "./fenceLinter";
import { SECONDARY_BUTTON_CLASS } from "./ui";

export interface MemoEditorInnerProps {
  value: string;
  onChange: (value: string) => void;
  onReady: () => void;
  autoFocus?: boolean;
  minHeight?: string;
}

const MAX_TEXT_LENGTH = 10000;

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.set("file", file);
  const res = await fetch("/api/images", { method: "POST", body: formData });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(
      body?.error ?? `アップロードに失敗しました (HTTP ${res.status})`,
    );
  }
  return body.data.url as string;
}

function insertText(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

// アップロード中に本文が編集されても正しい場所を差し替えられるよう、
// 位置ではなく一意なプレースホルダ文字列を検索して置換する
function replaceToken(view: EditorView, token: string, replacement: string): void {
  const pos = view.state.doc.toString().indexOf(token);
  if (pos < 0) {
    return; // ユーザーがプレースホルダを消した場合は何もしない
  }
  view.dispatch({
    changes: { from: pos, to: pos + token.length, insert: replacement },
  });
}

function imageFiles(list: FileList | undefined | null): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

// プレースホルダの一意性のための連番 (インスタンス間で共有してよい)
let uploadSeq = 0;

// markdown 用 CodeMirror エディタ本体 (制御コンポーネント)。
// 画像はペースト / ドラッグ&ドロップ / 画像ボタンで /api/images へアップロードし、
// カーソル位置に ![](url) を挿入する
export default function MemoEditorInner({
  value,
  onChange,
  onReady,
  autoFocus = false,
  minHeight = "14rem",
}: MemoEditorInnerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // undo / redo ボタンの活殺 (docs/11-アプリ的UIUX計画.md §2-4)。
  // 履歴自体は basicSetup が既定で持っている (Ctrl+Z も従来どおり効く)
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onReady();
    // マウント時に一度だけ通知する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // アップロード完了前に送信すると画像リンクが memo に入らないため、
  // アップロード中だけフォーム送信をブロックして知らせる
  useEffect(() => {
    if (!uploading) {
      return;
    }
    const form = wrapperRef.current?.closest("form");
    if (!form) {
      return;
    }
    const blockSubmit = (event: SubmitEvent) => {
      event.preventDefault();
      setError("画像のアップロード中です。完了してから更新して下さい。");
    };
    form.addEventListener("submit", blockSubmit);
    return () => form.removeEventListener("submit", blockSubmit);
  }, [uploading]);

  const insertImages = async (view: EditorView, files: File[]) => {
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const token = `![アップロード中 ${++uploadSeq}]()`;
        insertText(view, token);
        try {
          const url = await uploadImage(file);
          replaceToken(view, token, `![](${url})`);
        } catch (e) {
          replaceToken(view, token, "");
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const extensions = useMemo(() => {
    // markdown() は内部で新しい言語インスタンスを作ってそこに組み込み補完を
    // 登録する。export される markdownLanguage は別インスタンスのため、
    // そちらに登録しても効かない (バンドル環境で languageDataAt に載らない)。
    // markdown() が返した当のインスタンス (md.language) に登録する
    const md = markdown();
    return [
      md,
      // ```<言語> の補完 (basicSetup が autocompletion を既定で有効化済み)。
      // override せず language data 経由で登録し、組み込み補完と共存させる
      md.language.data.of({ autocomplete: fenceLanguageCompletion }),
      // circuitikz / mermaid の打ち間違いに警告を出す (補完だけでは
      // 入れ替わり誤字が無反応で確定してしまうため)
      fenceLanguageLinter,
      EditorView.lineWrapping,
      // 旧 textarea の maxLength 相当: 上限を超える変更を受け付けない
      EditorState.changeFilter.of((tr) => tr.newDoc.length <= MAX_TEXT_LENGTH),
      EditorView.domEventHandlers({
        paste: (event, view) => {
          const files = imageFiles(event.clipboardData?.files);
          if (files.length === 0) {
            return false;
          }
          event.preventDefault();
          void insertImages(view, files);
          return true;
        },
        drop: (event, view) => {
          const files = imageFiles(event.dataTransfer?.files);
          if (files.length === 0) {
            return false;
          }
          event.preventDefault();
          // ドロップした位置にカーソルを移してから挿入する
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            view.dispatch({ selection: { anchor: pos } });
          }
          void insertImages(view, files);
          return true;
        },
      }),
    ];
    // insertImages は ref と state セッターのみ参照するため再生成不要
  }, []);

  // undo / redo をボタンから呼ぶ。モバイルには Ctrl+Z がないため
  const runHistoryCommand = (command: (view: EditorView) => boolean) => {
    const view = editorRef.current?.view;
    if (view) {
      command(view);
      view.focus();
    }
  };

  const handleFilePick = (files: FileList | null) => {
    const view = editorRef.current?.view;
    const picked = imageFiles(files);
    if (view && picked.length > 0) {
      void insertImages(view, picked);
    }
    // 同じファイルを続けて選べるようリセットする
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div ref={wrapperRef} className="space-y-2">
      <div className="overflow-hidden rounded border border-gray-300 bg-white">
        <CodeMirror
          ref={editorRef}
          value={value}
          onChange={onChange}
          extensions={extensions}
          autoFocus={autoFocus}
          minHeight={minHeight}
          placeholder="メモを入力して下さい。"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
          }}
          // 履歴の深さが変わったときだけボタンの活殺を更新する。
          // onUpdate はカーソル移動でも呼ばれるので、同じ値なら前の state を
          // 返して再レンダリングを止める
          onUpdate={(update) => {
            const next = {
              canUndo: undoDepth(update.state) > 0,
              canRedo: redoDepth(update.state) > 0,
            };
            setHistory((prev) =>
              prev.canUndo === next.canUndo && prev.canRedo === next.canRedo
                ? prev
                : next,
            );
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => runHistoryCommand(undo)}
          disabled={!history.canUndo}
          className={SECONDARY_BUTTON_CLASS}
        >
          元に戻す
        </button>
        <button
          type="button"
          onClick={() => runHistoryCommand(redo)}
          disabled={!history.canRedo}
          className={SECONDARY_BUTTON_CLASS}
        >
          やり直す
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={SECONDARY_BUTTON_CLASS}
        >
          {uploading ? "アップロード中…" : "画像を挿入"}
        </button>
        {/* ペースト・ドラッグ&ドロップは実質デスクトップの操作なので、
            幅が狭いときは畳んでボタンの場所を空ける */}
        <span className="hidden text-gray-400 sm:inline">
          画像はペースト・ドラッグ&ドロップでも挿入できます
        </span>
        <span
          className={`ml-auto ${
            value.length >= MAX_TEXT_LENGTH
              ? "font-bold text-red-600"
              : "text-gray-400"
          }`}
        >
          {value.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}
        </span>
      </div>
      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        hidden
        onChange={(e) => handleFilePick(e.target.files)}
      />
    </div>
  );
}
