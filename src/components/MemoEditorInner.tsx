"use client";

import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordingAltText } from "@/lib/audio/audioRecorder";
import { AUDIO_EXTENSION_ALTERNATION } from "@/lib/audioFormats";
import { imageAtCursor, ocrInsertion, ocrPlaceholder } from "@/lib/ocr/ocrQuote";
import {
  ocrButtonLabel,
  recordButtonLabel,
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
import { useAudioRecording } from "./useAudioRecording";

// fabric 一式は重いので、お絵かきを開くまで読み込まない
// (CodeMirror を遅延させているのと同じ流儀。MemoEditor.tsx 参照)
const DrawModal = dynamic(() => import("./draw/DrawModal"), {
  ssr: false,
  loading: () => null,
});

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

// 音声 (docs/12-添付ファイル種類拡張メモ.md)。mp3/m4a/wav/webm を受け付ける。
// audio/x-m4a は一部ブラウザが m4a に付ける別名。webm はブラウザ内録音の
// 出力形式で、ファイル選択からも受ける。最終判定はサーバの
// sniffAudioFormat が中身を見て行う (音声トラックだけの webm しか通らない)
const ACCEPTED_AUDIO_TYPES =
  "audio/mpeg,audio/mp4,audio/wav,audio/x-m4a,audio/webm,.mp3,.m4a,.wav,.webm";

// PDF (docs/12-添付ファイル種類拡張メモ.md)。表示はブラウザ内蔵ビューアに任せ、
// 本文にはリンクだけを出す
const ACCEPTED_PDF_TYPES = "application/pdf,.pdf";

const ACCEPTED_FILE_TYPES = `${ACCEPTED_IMAGE_TYPES},${ACCEPTED_AUDIO_TYPES},${ACCEPTED_PDF_TYPES}`;

// ペースト/ドロップで拾う画像の判定。MIME が image/* のもの、または
// 対応拡張子を持つもの (MIME を空で送る HEIC 対策)。実体の検査はサーバが行う
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|heic|heif|tiff?)$/i;

// 音声の判定。MIME が audio/* のもの、または対応拡張子を持つもの。
const AUDIO_EXT_RE = new RegExp(`\\.(?:${AUDIO_EXTENSION_ALTERNATION})$`, "i");

const PDF_EXT_RE = /\.pdf$/i;

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXT_RE.test(file.name);
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || PDF_EXT_RE.test(file.name);
}

// PDF は元のファイル名を画像記法の alt に残す。UUID 名では中身が判らないうえ、
// 本文に入れておけば PGroonga の全文検索でファイル名から引ける。
// `]` と改行は画像記法そのものを壊すので落とす (URL 側はサーバ発番の UUID)。
function pdfAltText(fileName: string): string {
  const cleaned = fileName.replace(/[[\]\r\n]/g, "").trim();
  return cleaned.length > 0 ? cleaned : "PDF";
}

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

// アップロード対象に拾うファイル (画像・音声・PDF)。
function pickFiles(list: FileList | undefined | null): File[] {
  return Array.from(list ?? []).filter(
    (f) =>
      f.type.startsWith("image/") ||
      IMAGE_EXT_RE.test(f.name) ||
      isAudioFile(f) ||
      isPdfFile(f),
  );
}

// 処理中にフォーム送信を止めたときに出す理由。**録音を先に見る** —
// アップロードや OCR は画面に進捗が出ているが、録音は押しっぱなしのまま
// 更新しようとすることがあり、そのまま通すと録音ごと失うため
function busyReason(isRecording: boolean, uploading: boolean): string {
  if (isRecording) {
    return "録音中です。停止してから更新して下さい。";
  }
  if (uploading) {
    return "画像のアップロード中です。完了してから更新して下さい。";
  }
  return "OCR 処理中です。完了してから更新して下さい。";
}

// CodeMirror に渡す設定はレンダリングごとに作り直さない。
// @uiw/react-codemirror は basicSetup / onUpdate の**参照**が変わるたびに
// StateEffect.reconfigure で拡張一式を組み直すため、毎回新しいオブジェクトを
// 渡すと打鍵のたびに全部が再構成される。録音中は 1 秒ごとに再レンダリングが
// 走るので、そのままだと再構成もその回数だけ起きる
const BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
} as const;

// プレースホルダの一意性のための連番 (インスタンス間で共有してよい)
let uploadSeq = 0;
let ocrSeq = 0;

interface InsertFilesOptions {
  // 音声の画像記法に入れる alt。録音は日時を残したいので上書きする
  // (ファイル選択・ペースト由来の音声は既定の "audio" のまま)
  audioAlt?: string;
  // 画像の alt。お絵かきは「いつ描いたか」を残して全文検索から引けるようにする
  // (ファイル選択・ペースト由来の画像は既定の空のまま)
  imageAlt?: string;
  // 挿入した画像を続けて OCR するか。お絵かきは自分で描いたものなので読まない
  // (要るときは「後から OCR」ボタンで読ませられる)
  ocr?: boolean;
}

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
  // お絵かき画面。null なら閉じている。開くときにカーソルの近くの画像を控え、
  // 下敷きの候補として渡す (docs/34-お絵かき計画.md §2)
  const [drawing, setDrawing] = useState<{ sourceImageUrl: string | null } | null>(
    null,
  );
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

  // 編集画面からのその場録音 (docs/12「ノート内録音の実装計画」)。
  // 録音できたものは、ファイル選択と同じ挿入経路 (insertFiles) に流す。
  // alt には録音日時を残す (PDF のファイル名と同じ狙いで、全文検索から引ける)
  const recording = useAudioRecording({
    onFinish: async (result) => {
      const view = editorRef.current?.view;
      if (!view) {
        return;
      }
      await insertFiles(view, [result.file], {
        audioAlt: recordingAltText(result.recordedAt),
      });
    },
    onError: setError,
  });

  // アップロード / OCR / 録音の完了前に送信すると、画像リンクや OCR 結果、
  // 録音そのものが memo に入らないため、処理中だけフォーム送信をブロックして知らせる
  const busy = uploading || ocrCount > 0 || recording.isRecording;
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
      setError(busyReason(recording.isRecording, uploading));
    };
    form.addEventListener("submit", blockSubmit);
    return () => form.removeEventListener("submit", blockSubmit);
  }, [busy, uploading, recording.isRecording]);

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

  const insertFiles = async (
    view: EditorView,
    files: File[],
    options: InsertFilesOptions = {},
  ) => {
    const { audioAlt = "audio", imageAlt = "", ocr = true } = options;
    setError(null);
    try {
      for (const [index, file] of files.entries()) {
        const token = `![アップロード中 ${++uploadSeq}]()`;
        insertText(view, token);
        setUpload({ current: index + 1, total: files.length, percent: 0 });
        try {
          // 送信 % はボタンラベル (React state) だけに出す。本文トークンを
          // % で書き換えると undo が壊れる (ocrIntoDoc の同旨コメント参照)。
          // アップロードは直列なので、ボタンの % が常に今のファイルの %。
          // 画像・音声とも同じ /api/images へ送る (サーバが中身で振り分ける)
          const url = await uploadImageWithProgress(file, (percent) => {
            setUpload({ current: index + 1, total: files.length, percent });
          });
          // 音声は ![audio](url)、PDF は ![ファイル名.pdf](url) で挿入し、
          // MarkdownView が src の拡張子を見て <audio> / リンクに振り分ける。
          // 画像は従来どおり ![](url)
          const isAudio = isAudioFile(file);
          const isPdf = !isAudio && isPdfFile(file);
          const markup = isAudio
            ? `![${audioAlt}](${url})`
            : isPdf
              ? `![${pdfAltText(file.name)}](${url})`
              : `![${imageAlt}](${url})`;
          replaceToken(view, token, markup);
          if (isAudio || isPdf || !ocr) {
            continue; // 画像でないもの・OCR を頼まれていないものは読まない
          }
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
          const files = pickFiles(event.clipboardData?.files);
          if (files.length === 0) {
            return false;
          }
          event.preventDefault();
          void insertFiles(view, files);
          return true;
        },
        drop: (event, view) => {
          const files = pickFiles(event.dataTransfer?.files);
          if (files.length === 0) {
            return false;
          }
          event.preventDefault();
          // ドロップした位置にカーソルを移してから挿入する
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            view.dispatch({ selection: { anchor: pos } });
          }
          void insertFiles(view, files);
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

  // 「お絵かき」: カーソルの近くに自前画像があればそれを下敷きにして開く。
  // 「後から OCR」と同じ探し方 (imageAtCursor) なので、画像の上で押せば
  // その画像に描ける。下敷きが要らなければお絵かき画面で白紙に切り替えられる
  const openDrawing = () => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    setError(null);
    const hit = imageAtCursor(
      view.state.doc.toString(),
      view.state.selection.main.head,
    );
    setDrawing({ sourceImageUrl: hit?.url ?? null });
  };

  // 描いたものは 1 枚の画像として、ファイル選択と同じ挿入経路に流す。
  // 元にした画像は書き換えない (描いたものは別の画像として増える)
  const insertDrawing = (file: File, alt: string) => {
    setDrawing(null);
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    view.focus();
    void insertFiles(view, [file], { imageAlt: alt, ocr: false });
  };

  // 履歴の深さが変わったときだけボタンの活殺を更新する。
  // onUpdate はカーソル移動でも呼ばれるので、同じ値なら前の state を
  // 返して再レンダリングを止める。
  // **参照を固定する** — CodeMirror はこの関数の参照が変わると拡張一式を
  // 組み直す (BASIC_SETUP のコメント参照)
  const handleUpdate = useCallback((update: ViewUpdate) => {
    const next = {
      canUndo: undoDepth(update.state) > 0,
      canRedo: redoDepth(update.state) > 0,
    };
    setHistory((prev) =>
      prev.canUndo === next.canUndo && prev.canRedo === next.canRedo
        ? prev
        : next,
    );
  }, []);

  const handleFilePick = (files: FileList | null) => {
    const view = editorRef.current?.view;
    const picked = pickFiles(files);
    if (view && picked.length > 0) {
      void insertFiles(view, picked);
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
          basicSetup={BASIC_SETUP}
          onUpdate={handleUpdate}
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
          onClick={recording.toggle}
          // 録音中だけは busy でも押せる。止められないと録音が終わらない
          disabled={busy && !recording.isRecording}
          aria-pressed={recording.isRecording}
          className={SECONDARY_BUTTON_CLASS}
        >
          {recording.isRecording && (
            <span
              aria-hidden
              className="size-2.5 animate-pulse rounded-full bg-red-600"
            />
          )}
          {recordButtonLabel(recording.isRecording, recording.elapsedMs)}
        </button>
        <button
          type="button"
          onClick={openDrawing}
          disabled={busy}
          className={SECONDARY_BUTTON_CLASS}
        >
          お絵かき
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
          画像・音声・PDF はペースト・ドラッグ&ドロップでも挿入できます
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
      {/* 自動停止の知らせ。押していないのに止まった理由が判らないと、
          録音が切れた原因を探せない */}
      {recording.note && (
        <p aria-live="polite" className={BUSY_NOTICE_CLASS}>
          {recording.note}
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
        accept={ACCEPTED_FILE_TYPES}
        multiple
        hidden
        onChange={(e) => handleFilePick(e.target.files)}
      />
      {drawing && (
        <DrawModal
          sourceImageUrl={drawing.sourceImageUrl}
          onCancel={() => setDrawing(null)}
          onInsert={insertDrawing}
        />
      )}
    </div>
  );
}
