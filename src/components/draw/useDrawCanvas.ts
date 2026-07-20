"use client";

// fabric の canvas 一式の面倒を見るフック (docs/34-お絵かき計画.md §3)。
// 道具の切り替え・取り消し履歴・背景画像・書き出しをここに閉じ込め、
// 見た目 (DrawModal / DrawToolbar) からは fabric を見えなくする。

import "@erase2d/fabric"; // 副作用: ClippingGroup を classRegistry へ登録する
import { EraserBrush } from "@erase2d/fabric";
import * as fabric from "fabric";
import { useCallback, useEffect, useRef, useState } from "react";
import { markerColor } from "@/lib/draw/drawColor";
import {
  blankCanvasSize,
  canvasSizeForImage,
  type CanvasSize,
} from "@/lib/draw/drawingFile";
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  currentEntry,
  type DrawHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from "@/lib/draw/history";
import type { DrawTool } from "./drawTools";
import { attachShapeTool } from "./shapeTool";

export type { DrawTool };

// 消しゴムはペンと同じ太さだと細すぎて狙って消せない
const ERASER_SCALE = 3;
const MIN_ERASER_WIDTH = 8;

// マーカーは蛍光ペンなので、ペンより太くないとそれらしく見えない
const MARKER_SCALE = 3;

// 描き終わりから履歴を積むまでの待ち。1 ストロークで複数のイベントが飛ぶので、
// まとめて 1 手にする
const SNAPSHOT_DEBOUNCE_MS = 150;

// 書き出しは WebP を第一候補にする。写真に注釈を入れると PNG では
// 10MB の投稿上限 (src/lib/uploads.ts) に届きうるため
const WEBP_QUALITY = 0.92;

// 白紙の下地。透過のままだと、貼った先の背景次第で線が見えなくなる
const CANVAS_BACKGROUND = "#ffffff";

// 表示倍率の下限。測り終える前の 0 で割らないための保険
const MIN_DISPLAY_SCALE = 0.05;

// 小さい画像を下敷きにしたとき、原寸のままだと狙って描けない。
// ただし伸ばしすぎてもぼけるだけなので頭を打たせる
const MAX_DISPLAY_SCALE = 3;

// 文字の大きさ。太さから決める (太いペンを選んでいるなら大きい字が要る)
const FONT_SCALE = 4;
const MIN_FONT_SIZE = 18;

// 日本語を出すので、既定の Times New Roman には任せない
const FONT_FAMILY = "system-ui, sans-serif";

// 図形をドラッグで置くときの、タップと区別する最小の移動量 (画面で見た px)
const MIN_SHAPE_DRAG = 4;

// 返り値に ref を混ぜない。ref を持つオブジェクトはレンダー中に読めない
// ものとして扱われるため (react-hooks/refs)、canvas と枠の ref は引数で受ける
export interface DrawCanvasApi {
  // canvas の論理サイズ (= 書き出す画像の解像度)。準備できるまで null
  size: CanvasSize | null;
  // canvas を画面に出すときの倍率。呼び手はこれで CSS の拡縮をかける
  displayScale: number;
  isPreparing: boolean;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  isEmpty: boolean;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportImage: () => Promise<{ blob: Blob; extension: string }>;
}

interface UseDrawCanvasParams {
  tool: DrawTool;
  color: string;
  // 太さ・文字の大きさは**画面で見たときの px** で受ける。ユーザーが選ぶのは
  // 見た目の太さなので、canvas の論理サイズが大きいほど太く描く必要がある
  width: number;
  // 背景に敷く自前画像の URL (`/api/images/...`)。白紙なら null
  backgroundUrl: string | null;
  // canvas を出す領域の実測値。論理サイズとの比が表示倍率になる。
  // 測る前 (0) や画面の回転にも追従する
  availableWidth: number;
  availableHeight: number;
  // fabric を載せる canvas 要素
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  // 白紙のときの器の縦横比を決めるために測る、canvas を置く枠。
  // 初期化 (mount 後) に 1 度だけ読む
  containerRef: React.RefObject<HTMLElement | null>;
}

// 画面で見た px を canvas の論理 px に直す。1600px の写真を幅 400px で表示して
// いるなら 6px の線は 24 論理 px —— これをしないと、大きな画像に描いた線が
// 髪の毛のように細くなる。0 除算と、測る前の 0 を避けて下限を敷く
function toCanvasUnits(screenPixels: number, displayScale: number): number {
  return screenPixels / Math.max(displayScale, MIN_DISPLAY_SCALE);
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function useDrawCanvas({
  tool,
  color,
  width,
  backgroundUrl,
  availableWidth,
  availableHeight,
  canvasElRef,
  containerRef,
}: UseDrawCanvasParams): DrawCanvasApi {
  const fcRef = useRef<fabric.Canvas | null>(null);
  // シーンを流し込んでいる間は履歴を積まない (戻した結果をまた積むと戻れなくなる)
  const suppressRef = useRef(false);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const eraserDisposerRef = useRef<(() => void) | null>(null);
  const eraserRef = useRef<EraserBrush | null>(null);
  const detachShapeToolRef = useRef<(() => void) | null>(null);
  const historyRef = useRef<DrawHistory>(createHistory(""));

  const [size, setSize] = useState<CanvasSize | null>(null);

  // 論理サイズを表示領域に収める倍率。canvas 全体が見えていないと
  // 描いた端が確かめられないので、幅と高さの両方を満たす方に合わせる
  const displayScale =
    size && availableWidth > 0 && availableHeight > 0
      ? Math.min(
          availableWidth / size.width,
          availableHeight / size.height,
          MAX_DISPLAY_SCALE,
        )
      : 1;
  const [isPreparing, setIsPreparing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [isEmpty, setIsEmpty] = useState(true);

  // 初期化のときに 1 度だけ束ねた fabric のイベントハンドラから、
  // そのときどきの道具・色・太さを読むための控え
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(width);
  const displayScaleRef = useRef(displayScale);
  useEffect(() => {
    toolRef.current = tool;
    colorRef.current = color;
    widthRef.current = width;
    displayScaleRef.current = displayScale;
  }, [tool, color, width, displayScale]);

  // 消しゴムを手放す。@erase2d の dispose は効果用の裏 canvas を 0×0 にして
  // GC に返すためのもので、呼ばないと捨てたブラシのぶんだけメモリが残る
  const releaseEraser = useCallback(() => {
    eraserDisposerRef.current?.();
    eraserDisposerRef.current = null;
    eraserRef.current?.dispose();
    eraserRef.current = null;
  }, []);

  // いまのブラシに色と太さを当てる。**ブラシは作り直さない** ——
  // EraserBrush は生成時に canvas 1 枚ぶんのメモリを確保するので、
  // 太さを変えるたびに作り直すと確保と破棄を繰り返すことになる
  const applyBrushStyle = useCallback(() => {
    const brush = fcRef.current?.freeDrawingBrush;
    if (!brush) {
      return;
    }
    const width = widthRef.current;
    const scale = displayScaleRef.current;
    if (toolRef.current === "eraser") {
      // 消しゴムに色は無い (下を消すだけ)
      brush.width = toCanvasUnits(Math.max(MIN_ERASER_WIDTH, width * ERASER_SCALE), scale);
      return;
    }
    if (toolRef.current === "marker") {
      brush.width = toCanvasUnits(width * MARKER_SCALE, scale);
      brush.color = markerColor(colorRef.current);
      return;
    }
    brush.width = toCanvasUnits(width, scale);
    brush.color = colorRef.current;
  }, []);

  const syncHistoryState = useCallback((history: DrawHistory) => {
    historyRef.current = history;
    setHistoryState({ canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
  }, []);

  const snapshot = useCallback((): string => {
    const fc = fcRef.current;
    return fc ? JSON.stringify(fc.toObject(["erasable"])) : "";
  }, []);

  // 変更が落ち着いたら 1 手として履歴に積む
  const scheduleSnapshot = useCallback(() => {
    if (suppressRef.current) {
      return;
    }
    clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      const fc = fcRef.current;
      if (!fc) {
        return;
      }
      syncHistoryState(pushHistory(historyRef.current, snapshot()));
      setIsEmpty(fc.getObjects().length === 0);
    }, SNAPSHOT_DEBOUNCE_MS);
  }, [snapshot, syncHistoryState]);

  // 履歴のスナップショットを canvas へ戻す
  const applyEntry = useCallback(async (entry: string) => {
    const fc = fcRef.current;
    if (!fc || !entry) {
      return;
    }
    // 予約済みのスナップショットを捨てる。戻した結果をそのまま積み直すと
    // やり直しの先を失う
    clearTimeout(snapshotTimerRef.current);
    suppressRef.current = true;
    try {
      await fc.loadFromJSON(JSON.parse(entry));
      // 流し込んだ直後は全部が選択可能な既定に戻っているので、いまの道具に合わせ直す
      const selectable = toolRef.current === "select";
      fc.forEachObject((object) => {
        object.selectable = selectable;
        object.evented = selectable;
      });
      fc.requestRenderAll();
      setIsEmpty(fc.getObjects().length === 0);
    } catch {
      // 壊れたスナップショットは捨てる (いまの絵はそのまま残る)
    } finally {
      suppressRef.current = false;
    }
  }, []);

  // --- 初期化 (背景の有無ごとに 1 度) -------------------------------------
  useEffect(() => {
    const element = canvasElRef.current;
    if (!element) {
      return;
    }
    let disposed = false;
    setIsPreparing(true);
    setError(null);

    const setup = async () => {
      let image: fabric.FabricImage | null = null;
      let canvasSize: CanvasSize;
      // 白紙の器は開いた時点の枠だけで決める。描いている最中に画面を回して
      // 器を作り直すと、それまでの線の位置がずれるため、測るのは 1 度きり
      const rect = containerRef.current?.getBoundingClientRect();
      const blankSize = blankCanvasSize(rect?.width ?? 0, rect?.height ?? 0);

      if (backgroundUrl) {
        try {
          // 自前の画像 (同一オリジン) なので canvas は汚れず、書き出しもできる
          image = await fabric.FabricImage.fromURL(backgroundUrl, {
            crossOrigin: "anonymous",
          });
          canvasSize = canvasSizeForImage(image.width, image.height);
        } catch {
          setError("背景にする画像を読み込めませんでした。白紙で描けます。");
          image = null;
          canvasSize = blankSize;
        }
      } else {
        canvasSize = blankSize;
      }
      if (disposed) {
        return;
      }

      const fc = new fabric.Canvas(element, {
        selection: false,
        preserveObjectStacking: true,
        backgroundColor: CANVAS_BACKGROUND,
        // **消しゴムの速さはこれで決まる** (docs/34-お絵かき計画.md §3-2)。
        // 既定の true は実バッファを論理サイズ × devicePixelRatio にする。
        // ここでは論理サイズを解像度として大きく取り、表示は CSS で縮めている
        // ので、その上に DPR を掛けても画面には 1px も現れない —— 3 倍の端末
        // なら 9 倍の画素を捨てるために描いていることになる。
        // 消しゴムは 1 フレームに canvas 全体を 3 回描くため、この無駄が
        // そのまま体感の重さになる
        enableRetinaScaling: false,
      });
      fcRef.current = fc;
      fc.setDimensions(canvasSize);

      if (image) {
        image.set({
          left: 0,
          top: 0,
          originX: "left",
          originY: "top",
          scaleX: canvasSize.width / image.width,
          scaleY: canvasSize.height / image.height,
          selectable: false,
          evented: false,
          // 消しゴムで写真そのものを消させない (@erase2d は erasable な
          // 背景だけを消す)。消えるのは自分で描いた線だけにする
          erasable: false,
        });
        fc.backgroundImage = image;
      }

      // @erase2d は erasable が真のものしか消さない。fabric v7 の既定は未設定
      // なので、足したものに立てて回る
      fc.on("object:added", (event) => {
        const object = event.target;
        // erasable は @erase2d が見る拡張プロパティで fabric の型には無い。
        // 読むときだけ広げる (書き込みは set が任意のキーを受ける)。
        // 履歴から戻した図形は自分の erasable を持っているので上書きしない
        if (object && (object as { erasable?: unknown }).erasable === undefined) {
          object.set("erasable", true);
        }
      });
      for (const name of [
        "object:added",
        "object:removed",
        "object:modified",
        "text:changed",
      ] as const) {
        fc.on(name, scheduleSnapshot);
      }

      // 文字道具: 何も無い所を押したらその場に文字を置いて編集に入る
      fc.on("mouse:down", (options) => {
        if (toolRef.current !== "text" || options.target) {
          return;
        }
        const point = fc.getScenePoint(options.e);
        const text = new fabric.IText("", {
          left: point.x,
          top: point.y,
          fill: colorRef.current,
          fontFamily: FONT_FAMILY,
          fontSize: toCanvasUnits(
            Math.max(MIN_FONT_SIZE, widthRef.current * FONT_SCALE),
            displayScaleRef.current,
          ),
          erasable: true,
        });
        fc.add(text);
        fc.setActiveObject(text);
        text.enterEditing();
        text.hiddenTextarea?.focus();
      });
      // 空のまま編集を抜けたら消す (見えないゴミを残さない)
      fc.on("text:editing:exited", (event) => {
        const text = event.target;
        if (text && !String(text.text ?? "").trim()) {
          fc.remove(text);
        }
      });

      // 矢印・矩形・楕円のドラッグ描画 (docs/36 §1)。
      // ドラッグ中は仮の図形を出し入れするので履歴を止め、離したときに 1 手積む
      detachShapeToolRef.current = attachShapeTool(fc, {
        getTool: () => toolRef.current,
        getColor: () => colorRef.current,
        getStrokeWidth: () =>
          toCanvasUnits(widthRef.current, displayScaleRef.current),
        getMinDrag: () => toCanvasUnits(MIN_SHAPE_DRAG, displayScaleRef.current),
        beginPreview: () => {
          suppressRef.current = true;
        },
        endPreview: (commit) => {
          suppressRef.current = false;
          if (commit) {
            scheduleSnapshot();
          }
        },
      });

      fc.requestRenderAll();
      setSize(canvasSize);
      syncHistoryState(createHistory(JSON.stringify(fc.toObject(["erasable"]))));
      setIsEmpty(true);
      setIsPreparing(false);
    };

    void setup();

    return () => {
      disposed = true;
      clearTimeout(snapshotTimerRef.current);
      releaseEraser();
      detachShapeToolRef.current?.();
      detachShapeToolRef.current = null;
      const fc = fcRef.current;
      fcRef.current = null;
      void fc?.dispose();
    };
  }, [
    backgroundUrl,
    canvasElRef,
    containerRef,
    releaseEraser,
    scheduleSnapshot,
    syncHistoryState,
  ]);

  // --- 道具の切り替え -----------------------------------------------------
  // ブラシを作り直すのは**道具が変わったときだけ**。色・太さの変更で作り直すと
  // 消しゴムのメモリ確保を繰り返すことになる (applyBrushStyle 参照)
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc || isPreparing) {
      return;
    }
    fc.isDrawingMode = tool === "pen" || tool === "marker" || tool === "eraser";
    fc.selection = tool === "select";
    fc.forEachObject((object) => {
      object.selectable = tool === "select";
      object.evented = tool === "select";
    });
    if (tool !== "select") {
      fc.discardActiveObject();
    }

    if (tool === "pen" || tool === "marker") {
      // マーカーは色に alpha を載せた PencilBrush。**alpha < 1 のブラシは
      // needsFullRender() が真になり、消しゴムと同じ毎フレーム全再描画の
      // 経路に入る** (docs/36 §2)。docs/34 §3-2 の対策が効いている前提
      fc.freeDrawingBrush = new fabric.PencilBrush(fc);
    } else if (tool === "eraser") {
      const brush = new EraserBrush(fc);
      eraserRef.current = brush;
      fc.freeDrawingBrush = brush;
      // 消しゴムは object:* イベントを出さない (既存オブジェクトの clipPath を
      // 足すだけ) ので、専用の終了イベントから履歴を積む
      eraserDisposerRef.current = brush.on("end", () => scheduleSnapshot());
    } else {
      // 描かない道具のときはブラシを持たない (消しゴムの裏 canvas を抱えたままに
      // しない)
      fc.freeDrawingBrush = undefined;
    }
    applyBrushStyle();
    fc.requestRenderAll();

    return releaseEraser;
  }, [tool, isPreparing, scheduleSnapshot, applyBrushStyle, releaseEraser]);

  // --- 色・太さ・表示倍率の反映 --------------------------------------------
  useEffect(() => {
    applyBrushStyle();
  }, [color, width, displayScale, applyBrushStyle]);

  const undo = useCallback(() => {
    const next = undoHistory(historyRef.current);
    if (next === historyRef.current) {
      return;
    }
    syncHistoryState(next);
    void applyEntry(currentEntry(next));
  }, [applyEntry, syncHistoryState]);

  const redo = useCallback(() => {
    const next = redoHistory(historyRef.current);
    if (next === historyRef.current) {
      return;
    }
    syncHistoryState(next);
    void applyEntry(currentEntry(next));
  }, [applyEntry, syncHistoryState]);

  const clear = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) {
      return;
    }
    const objects = [...fc.getObjects()];
    if (objects.length === 0) {
      return;
    }
    fc.remove(...objects); // object:removed が履歴を積む (= 全消しも戻せる)
    fc.requestRenderAll();
  }, []);

  const exportImage = useCallback(async () => {
    const fc = fcRef.current;
    if (!fc) {
      throw new Error("お絵かきの準備ができていません。");
    }
    // 選択枠や編集中のカーソルを写さない
    fc.discardActiveObject();
    fc.renderAll();
    const element = fc.toCanvasElement();
    const webp = await toBlob(element, "image/webp", WEBP_QUALITY);
    if (webp && webp.type === "image/webp") {
      return { blob: webp, extension: "webp" };
    }
    // WebP を書き出せないブラウザは PNG へ落とす (toBlob は非対応の形式を
    // 黙って PNG にすることがあるので、type を見てから決める)
    const png = await toBlob(element, "image/png");
    if (!png) {
      throw new Error("お絵かきを画像にできませんでした。");
    }
    return { blob: png, extension: "png" };
  }, []);

  return {
    size,
    displayScale,
    isPreparing,
    error,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    isEmpty,
    undo,
    redo,
    clear,
    exportImage,
  };
}
