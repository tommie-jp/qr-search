"use client";

import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { imageAtCursor, ocrInsertion, ocrPlaceholder } from "@/lib/ocr/ocrQuote";
import {
  ocrButtonLabel,
  uploadButtonLabel,
  type UploadProgress,
} from "@/lib/progressLabels";
import { fenceLanguageCompletion } from "./fenceCompletion";
import { fenceLanguageLinter } from "./fenceLinter";
import {
  disposeOcr,
  isOcrReady,
  MODEL_READY_PERCENT,
  ocrImageToQuote,
  subscribeModelProgress,
} from "./ocr/ocrService";
import { uploadImageWithProgress } from "./uploadImageXhr";
import {
  BUSY_NOTICE_CLASS,
  BUSY_SPINNER_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "./ui";

export interface MemoEditorInnerProps {
  value: string;
  onChange: (value: string) => void;
  onReady: () => void;
  autoFocus?: boolean;
  minHeight?: string;
}

const MAX_TEXT_LENGTH = 10000;

// ファイル選択ダイアログの絞り込み。MIME に加えて拡張子も併記するのは、
// iOS/一部 OS が HEIC の MIME を空で送ることがあり、MIME だけだと選べないため。
// HEIC/HEIF・TIFF はサーバが保存時に WebP へ変換する (docs/26-画像形式対応計画.md)。
// 最終的な形式判定はサーバの sniffImageFormat が中身を見て行う
const ACCEPTED_IMAGE_TYPES =
  "image/png,image/jpeg,image/gif,image/webp,image/avif,image/heic,image/heif,image/tiff,.png,.jpg,.jpeg,.gif,.webp,.avif,.heic,.heif,.tif,.tiff";

// ペースト/ドロップで拾う画像の判定。MIME が image/* のもの、または
// 対応拡張子を持つもの (MIME を空で送る HEIC 対策)。実体の検査はサーバが行う
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|heic|heif|tiff?)$/i;

// アップロード済みの画像を Blob として取り直す。OCR は元 File ではなく
// これを読む: HEIC など Chrome/Firefox が createImageBitmap で復号できない
// 形式でも、保存時に WebP へ変換済みのバイトなら OCR・表示・検索が同じ画素を見る。
// 取得できなければ null (アップロードは成功しているので OCR だけ諦める)
async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
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
  return Array.from(list ?? []).filter(
    (f) => f.type.startsWith("image/") || IMAGE_EXT_RE.test(f.name),
  );
}

// プレースホルダの一意性のための連番 (インスタンス間で共有してよい)
let uploadSeq = 0;
let ocrSeq = 0;

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
  // 進行中アップロードの表示用スナップショット (何枚目 / 全何枚 / 送信 %)。
  // null なら待機中。busy 判定は従来の uploading boolean と同じ意味を保つ
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const uploading = upload !== null;
  // 実行中の OCR の本数 (複数画像を続けて OCR できる)。0 より大きい間は
  // 「OCR処理中」を出し、フォーム送信を止める (結果が本文に入る前に更新しない)。
  const [ocrCount, setOcrCount] = useState(0);
  // 初回のモデルダウンロードの実測 % (完了・待機中は null)
  const [modelPercent, setModelPercent] = useState<number | null>(null);
  // OCR の情報表示 (エラーではない「準備中」「見つかりませんでした」など)。
  // 初回はモデル取得で待ちが長く、灰色だと埋もれて「固まった」と誤解される
  // ため、画像検索の準備中バナーと同じ赤背景で目立たせる (ImageSearchModal)。
  const [ocrNote, setOcrNote] = useState<string | null>(null);
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

  // モデルダウンロードの % をバナーに流す。100 (初期化完了) でクリアする
  useEffect(() => {
    return subscribeModelProgress((percent) => {
      setModelPercent(percent >= MODEL_READY_PERCENT ? null : percent);
    });
  }, []);

  // 編集画面を離れたら OCR の Worker を落とす。抱えたままだと OpenCV と
  // onnxruntime の wasm ヒープが残り、後から開いた画像検索がモデルを積めずに
  // 落ちる (iOS WebKit のタブ上限)。terminate は realm ごと捨てるので
  // メモリが OS へ返る (ocrService.disposeOcr)
  useEffect(() => {
    return () => {
      disposeOcr("編集画面を離脱");
    };
  }, []);

  // アップロード / OCR 完了前に送信すると、画像リンクや OCR 結果が memo に
  // 入らないため、処理中だけフォーム送信をブロックして知らせる
  const busy = uploading || ocrCount > 0;
  useEffect(() => {
    if (!busy) {
      return;
    }
    const form = wrapperRef.current?.closest("form");
    if (!form) {
      return;
    }
    const blockSubmit = (event: SubmitEvent) => {
      event.preventDefault();
      setError(
        uploading
          ? "画像のアップロード中です。完了してから更新して下さい。"
          : "OCR 処理中です。完了してから更新して下さい。",
      );
    };
    form.addEventListener("submit", blockSubmit);
    return () => form.removeEventListener("submit", blockSubmit);
  }, [busy, uploading]);

  // 画像 1 枚を OCR し、指定位置へ引用ブロックを差し込む。挿入時 OCR と
  // 「後から OCR」ボタンの両方がこの 1 本を使う (docs/24-画像OCR計画.md §4)。
  // 処理中はプレースホルダを置き、本文が編集されても文字列一致で差し替える。
  const ocrIntoDoc = async (
    view: EditorView,
    // Blob を直接、または後から届く Promise で受ける。プレースホルダは
    // insertPos が新鮮なうちに同期で挿し、画像取得の await はその後に回す
    // (取得を待つ間に本文が動いても、置換は文字列一致なのでずれない)
    source: Blob | Promise<Blob | null>,
    insertPos: number,
  ) => {
    const seq = ++ocrSeq;
    const placeholder = ocrPlaceholder(seq);
    const insertion = ocrInsertion(placeholder);
    view.dispatch({ changes: { from: insertPos, insert: insertion } });
    setOcrCount((n) => n + 1);
    // モデルが載っていなければ読み込みが走る。処理中との区別を出す。
    // 「初回のみ」とは言えない: 画面を離れるとモデルを解放する (disposeOcr) ので、
    // 戻ってきた 2 回目以降もここを通る
    setOcrNote(isOcrReady() ? null : "OCR モデルを準備しています…");
    try {
      const blob = source instanceof Blob ? source : await source;
      if (!blob) {
        // 画像を取り直せなかった。OCR はおまけなので黙って諦める
        // (アップロードは成功していて画像自体は本文に載っている)
        replaceToken(view, insertion, "");
        setOcrNote(null);
        return;
      }
      const quote = await ocrImageToQuote(blob);
      if (quote) {
        replaceToken(view, placeholder, quote);
        setOcrNote(null);
      } else {
        // 0 文字は黙って消さない。プレースホルダごと除いて理由を出す
        replaceToken(view, insertion, "");
        setOcrNote("画像から文字が見つかりませんでした。");
      }
    } catch (e) {
      replaceToken(view, insertion, "");
      setError(e instanceof Error ? e.message : String(e));
      // 「準備しています…」を畳む。残すとエラーと並んで
      // 「まだ待てば直る」と誤解される (実機で確認)
      setOcrNote(null);
    } finally {
      setOcrCount((n) => n - 1);
    }
  };

  const insertImages = async (view: EditorView, files: File[]) => {
    setError(null);
    try {
      for (const [index, file] of files.entries()) {
        const token = `![アップロード中 ${++uploadSeq}]()`;
        insertText(view, token);
        setUpload({ current: index + 1, total: files.length, percent: 0 });
        try {
          // 送信 % はボタンラベル (React state) だけに出す。本文トークンを
          // % で書き換えると undo が壊れる (ocrIntoDoc の同旨コメント参照)。
          // アップロードは直列なので、ボタンの % が常に今のファイルの %
          const url = await uploadImageWithProgress(file, (percent) => {
            setUpload({ current: index + 1, total: files.length, percent });
          });
          const markup = `![](${url})`;
          replaceToken(view, token, markup);
          // 挿入した画像を OCR し、直後に引用ブロックを差し込む。
          // アップロードの流れは止めない (url は UUID で一意なので位置を引ける)。
          // OCR には元 File ではなく保存後の画像 (url) を読ませる。HEIC など
          // ブラウザが直接復号できない形式は、保存時に WebP へ変換済みのため
          const pos = view.state.doc.toString().indexOf(markup);
          if (pos >= 0) {
            void ocrIntoDoc(view, fetchImageBlob(url), pos + markup.length);
          }
        } catch (e) {
          replaceToken(view, token, "");
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpload(null);
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

  // 「後から OCR」: カーソル位置にいちばん近い自前画像を取り直して OCR する。
  // 既にある画像 (過去にアップロード済み) を後から検索対象にできる (docs/24 §4)。
  const runOcrAtCursor = async () => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    setError(null);
    setOcrNote(null);
    const doc = view.state.doc.toString();
    const hit = imageAtCursor(doc, view.state.selection.main.head);
    if (!hit) {
      setOcrNote(
        "カーソルの近くに画像が見つかりません。画像の上を選んでから押して下さい。",
      );
      return;
    }
    try {
      const res = await fetch(hit.url);
      if (!res.ok) {
        throw new Error(`画像を取得できませんでした (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      await ocrIntoDoc(view, blob, hit.insertAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
          {uploadButtonLabel(upload)}
        </button>
        <button
          type="button"
          onClick={() => void runOcrAtCursor()}
          disabled={busy}
          className={SECONDARY_BUTTON_CLASS}
        >
          {ocrButtonLabel(ocrCount)}
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
      {ocrNote && (
        <p
          aria-live="polite"
          aria-busy={ocrCount > 0}
          className={`${BUSY_NOTICE_CLASS} flex items-center gap-2`}
        >
          {ocrCount > 0 && <span aria-hidden className={BUSY_SPINNER_CLASS} />}
          {ocrNote}
          {/* % は aria-hidden で足す: aria-live が毎ティック読み上げないように */}
          {modelPercent !== null && <span aria-hidden> {modelPercent}%</span>}
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
