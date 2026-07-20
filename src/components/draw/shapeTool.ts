"use client";

// ドラッグで図形を置く道具 (docs/36-お絵かき拡張計画.md §1)。
// 矢印・矩形・楕円が対象で、始点→終点のドラッグで形を決める。
//
// ドラッグ中は仮の図形を出しては消して描き直す。この間に履歴を積むと
// 途中の形が 1 手として残ってしまうので、呼び手に止めてもらう
// (beginPreview / endPreview)。

import * as fabric from "fabric";
import {
  arrowGeometry,
  arrowPathData,
  type DragRect,
  dragDistance,
  type DrawPoint,
  normalizeDragRect,
  strokeCenteredRect,
} from "@/lib/draw/shapes";
import type { DrawTool } from "./drawTools";

export interface ShapeToolDeps {
  getTool: () => DrawTool;
  getColor: () => string;
  // canvas の論理 px に直した後の太さ
  getStrokeWidth: () => number;
  // タップと区別する最小の移動量 (canvas の論理 px)
  getMinDrag: () => number;
  // ドラッグ中は履歴を止める。commit が false なら何も置かずに終わった
  beginPreview: () => void;
  endPreview: (commit: boolean) => void;
  // 範囲だけを決める道具 (モザイク) の確定。図形は置かず、囲んだ矩形を渡す。
  // 実際に置くものは呼び手が後から作る (画素を読む処理が非同期なため)
  onRegion: (rect: DragRect) => void;
}

// 囲んだ範囲を見せるだけの仮の矩形。確定時には捨てるので、見えれば足りる
const REGION_PREVIEW_FILL = "rgba(0, 0, 0, 0.4)";

// 図形はドラッグで置くので、置いた直後に掴めてしまうと次のドラッグの邪魔に
// なる。選択は「選択」道具に切り替えたときだけ有効になる (useDrawCanvas)
const SHAPE_DEFAULTS = {
  // **fabric v7 の originX/originY の既定は center/center** (v7 の破壊的変更)。
  // 明示しないと left/top が「中心」と解釈され、図形が幅・高さの半分だけ
  // 左上へずれて描かれる (ドラッグとまったく別の場所に出る)。
  // Path (矢印) だけは座標を path データから決めるので影響を受けない —
  // 「矢印は合うのに四角・丸はズレる」の正体がこれ
  originX: "left",
  originY: "top",
  // 枠は線だけ。fabric の既定は黒の塗りつぶしなので、明示して外す
  // (PencilBrush が作る Path と同じ流儀で null を使う)
  fill: null,
  selectable: false,
  evented: false,
  erasable: true,
  strokeLineCap: "round",
  strokeLineJoin: "round",
} as const;

function createShape(
  tool: DrawTool,
  from: DrawPoint,
  to: DrawPoint,
  color: string,
  strokeWidth: number,
): fabric.FabricObject | null {
  const common = { ...SHAPE_DEFAULTS, stroke: color, strokeWidth };

  if (tool === "arrow") {
    return new fabric.Path(arrowPathData(arrowGeometry(from, to, strokeWidth)), common);
  }

  const rect = normalizeDragRect(from, to);
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }
  if (tool === "mosaic") {
    // 隠す範囲を見せるだけの仮表示。確定時に捨てて、画素を加工した
    // 画像に差し替える。処理される範囲 (onRegion に渡る rect) と
    // 見た目が一致するよう、ストロークは持たせない — fabric は
    // strokeWidth (既定 1) を stroke が無くても寸法に数える
    return new fabric.Rect({
      ...SHAPE_DEFAULTS,
      ...rect,
      fill: REGION_PREVIEW_FILL,
      stroke: undefined,
      strokeWidth: 0,
    });
  }
  // fabric の left/top は「ストロークを含む見た目の箱」の角なので、
  // 線の中心がドラッグ矩形に乗るよう半太さぶん戻す (ペン・矢印と同じ意味)
  const aligned = strokeCenteredRect(rect, strokeWidth);
  if (tool === "rect") {
    return new fabric.Rect({ ...common, ...aligned });
  }
  if (tool === "ellipse") {
    // Ellipse は左上と半径で持つ。ドラッグ矩形に内接させる
    return new fabric.Ellipse({
      ...common,
      left: aligned.left,
      top: aligned.top,
      rx: rect.width / 2,
      ry: rect.height / 2,
    });
  }
  return null;
}

// fabric の canvas にドラッグ描画を取り付ける。戻り値は取り外し関数
export function attachShapeTool(fc: fabric.Canvas, deps: ShapeToolDeps): () => void {
  let start: DrawPoint | null = null;
  let last: DrawPoint | null = null;
  let preview: fabric.FabricObject | null = null;

  const clearPreview = () => {
    if (preview) {
      fc.remove(preview);
      preview = null;
    }
  };

  const onDown = (options: { e: TypedEvent }) => {
    if (!isShapeTool(deps.getTool())) {
      return;
    }
    start = fc.getScenePoint(options.e);
    last = start;
    preview = null;
    deps.beginPreview();
  };

  const onMove = (options: { e: TypedEvent }) => {
    if (!start) {
      return;
    }
    last = fc.getScenePoint(options.e);
    // 形が変わるたびに作り直す。Path の path データを差し替えるより素直で、
    // ドラッグ中は履歴を止めているので add/remove が残ることもない
    clearPreview();
    const next = createShape(
      deps.getTool(),
      start,
      last,
      deps.getColor(),
      deps.getStrokeWidth(),
    );
    if (next) {
      preview = next;
      fc.add(next);
    }
    fc.requestRenderAll();
  };

  const onUp = () => {
    if (!start) {
      return;
    }
    // 動いていなければタップ。仮の図形は残さない
    const moved = last !== null && dragDistance(start, last) >= deps.getMinDrag();
    const region = moved && last ? normalizeDragRect(start, last) : null;
    const isRegionTool = deps.getTool() === "mosaic";
    if (!moved || isRegionTool) {
      // 範囲を決めるだけの道具は、仮表示を必ず捨てる
      clearPreview();
    }
    const committed = !isRegionTool && moved && preview !== null;
    start = null;
    last = null;
    preview = null;
    fc.requestRenderAll();
    // 履歴を戻してから範囲を渡す。加工した画像が後から add されたときに、
    // その object:added が 1 手として積まれるようにする
    deps.endPreview(committed);
    if (isRegionTool && region) {
      deps.onRegion(region);
    }
  };

  fc.on("mouse:down", onDown);
  fc.on("mouse:move", onMove);
  fc.on("mouse:up", onUp);

  return () => {
    fc.off("mouse:down", onDown);
    fc.off("mouse:move", onMove);
    fc.off("mouse:up", onUp);
  };
}

// fabric のポインタイベントは実際には Mouse/Touch/Pointer のいずれか。
// getScenePoint に渡せれば十分なのでここでは幅を持たせる
type TypedEvent = Parameters<fabric.Canvas["getScenePoint"]>[0];

export function isShapeTool(tool: DrawTool): boolean {
  return (
    tool === "arrow" || tool === "rect" || tool === "ellipse" || tool === "mosaic"
  );
}
