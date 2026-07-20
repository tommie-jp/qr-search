"use client";

// お絵かきの画面 (docs/34-お絵かき計画.md §2)。
// 白紙、またはカーソルの近くにある自前画像を下敷きにして描き、
// 描いたものを 1 枚の画像として本文へ挿し込む。
//
// ノート編集フォームの中から開くので、body へポータルで逃がす —
// form の中に置くと、中のボタンが「更新」として送信されてしまう。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_DRAW_COLOR,
  DEFAULT_DRAW_WIDTH,
  loadDrawPrefs,
  saveDrawPrefs,
} from "@/lib/draw/drawPrefs";
import { drawingAltText, drawingFileName } from "@/lib/draw/drawingFile";
import { BUSY_NOTICE_CLASS, BUSY_SPINNER_CLASS } from "@/components/ui";
import type { DrawTool } from "./drawTools";
import { DrawToolbar } from "./DrawToolbar";
import { useDrawCanvas } from "./useDrawCanvas";

const BAR_BUTTON_CLASS =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded px-3 font-medium text-white transition active:scale-95 disabled:opacity-40 disabled:active:scale-100";

interface DrawModalProps {
  // カーソルの近くにある自前画像の URL。下敷きの候補で、無ければ null
  sourceImageUrl: string | null;
  onCancel: () => void;
  onInsert: (file: File, alt: string) => void;
}

export function DrawModal({ sourceImageUrl, onCancel, onInsert }: DrawModalProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  // 近くに画像があればそれを下敷きにして開く。要らなければ「白紙にする」で外せる
  const [useBackground, setUseBackground] = useState(sourceImageUrl !== null);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [prefs, setPrefs] = useState(() =>
    typeof window === "undefined"
      ? { color: DEFAULT_DRAW_COLOR, width: DEFAULT_DRAW_WIDTH }
      : loadDrawPrefs(window.localStorage),
  );
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    size,
    displayScale,
    isEmpty,
    isPreparing,
    error: canvasError,
    canUndo,
    canRedo,
    undo,
    redo,
    clear,
    exportImage,
  } = useDrawCanvas({
    tool,
    color: prefs.color,
    width: prefs.width,
    backgroundUrl: useBackground ? sourceImageUrl : null,
    availableWidth: area.width,
    availableHeight: area.height,
    canvasElRef,
    containerRef: stageRef,
  });

  // 画面の回転やキーボードの開閉で描画領域が変わっても、canvas 全体が
  // 収まるように表示だけを拡縮する (論理サイズ = 書き出す解像度は変えない)
  useEffect(() => {
    const element = stageRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setArea({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const requestClose = () => {
    if (!isEmpty && !window.confirm("描いたものは保存されません。閉じますか？")) {
      return;
    }
    onCancel();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // 文字道具の編集中は fabric の隠し textarea に焦点がある。
      // そこでの Esc は「文字の入力をやめる」なので、画面は閉じない
      if (document.activeElement instanceof HTMLTextAreaElement) {
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // requestClose は isEmpty を読む。閉じる前の確認を出す条件が変わるので追う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, onCancel]);

  const updatePrefs = (next: { color: string; width: number }) => {
    setPrefs(next);
    if (typeof window !== "undefined") {
      saveDrawPrefs(window.localStorage, next);
    }
  };

  // 下敷きを入れ替えると器の寸法が変わり、描いた線の位置が合わなくなる。
  // 作り直す前に断る
  const toggleBackground = () => {
    if (!isEmpty && !window.confirm("描いたものは消えます。切り替えますか？")) {
      return;
    }
    setUseBackground((previous) => !previous);
  };

  const handleInsert = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const { blob, extension } = await exportImage();
      const now = new Date();
      const file = new File([blob], drawingFileName(now, extension), {
        type: blob.type,
      });
      // 挿入は呼び手 (エディタ) の仕事。ここは画面を閉じるだけ
      onInsert(file, drawingAltText(now));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setIsSaving(false);
    }
  };

  const isBusy = isPreparing || isSaving;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="お絵かき"
      className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white"
    >
      <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <h2 className="mr-auto font-medium">お絵かき</h2>
        {sourceImageUrl && (
          <button
            type="button"
            onClick={toggleBackground}
            disabled={isBusy}
            className={`${BAR_BUTTON_CLASS} bg-white/15 hover:bg-white/25`}
          >
            {useBackground ? "白紙にする" : "画像に描く"}
          </button>
        )}
        <button
          type="button"
          onClick={requestClose}
          disabled={isSaving}
          className={`${BAR_BUTTON_CLASS} bg-white/15 hover:bg-white/25`}
        >
          閉じる
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2"
      >
        {/* 縮めた後の見た目の大きさを持つ枠。これが無いと、transform は
            レイアウトを変えないので中央揃えが原寸基準になってずれる */}
        <div
          style={
            size
              ? {
                  width: size.width * displayScale,
                  height: size.height * displayScale,
                }
              : undefined
          }
        >
          <div
            style={
              size
                ? {
                    width: size.width,
                    height: size.height,
                    transform: `scale(${displayScale})`,
                    transformOrigin: "top left",
                  }
                : undefined
            }
          >
            <canvas ref={canvasElRef} />
          </div>
        </div>
        {isPreparing && (
          <p className="absolute inset-0 flex items-center justify-center gap-2">
            <span aria-hidden className={BUSY_SPINNER_CLASS} />
            準備しています…
          </p>
        )}
      </div>

      {(canvasError || saveError) && (
        <p aria-live="polite" className={`${BUSY_NOTICE_CLASS} mx-3 mb-2`}>
          {canvasError ?? saveError}
        </p>
      )}

      <DrawToolbar
        tool={tool}
        onTool={setTool}
        color={prefs.color}
        onColor={(color) => updatePrefs({ ...prefs, color })}
        width={prefs.width}
        onWidth={(width) => updatePrefs({ ...prefs, width })}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onClear={clear}
        disabled={isBusy}
      />

      <div className="flex items-center gap-3 px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void handleInsert()}
          disabled={isBusy || isEmpty}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded bg-blue-600 px-6 font-medium text-white transition active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          {isSaving && <span aria-hidden className={BUSY_SPINNER_CLASS} />}
          {isSaving ? "挿入中…" : "本文に挿入"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default DrawModal;
