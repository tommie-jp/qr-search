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
  dragDistance,
  type DrawPoint,
  normalizeDragRect,
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
}

// 図形はドラッグで置くので、置いた直後に掴めてしまうと次のドラッグの邪魔に
// なる。選択は「選択」道具に切り替えたときだけ有効になる (useDrawCanvas)
const SHAPE_DEFAULTS = {
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
  if (tool === "rect") {
    return new fabric.Rect({ ...common, ...rect });
  }
  if (tool === "ellipse") {
    // Ellipse は中心ではなく左上と半径で持つ。ドラッグ矩形に内接させる
    return new fabric.Ellipse({
      ...common,
      left: rect.left,
      top: rect.top,
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
    if (!moved) {
      clearPreview();
    }
    const committed = moved && preview !== null;
    start = null;
    last = null;
    preview = null;
    fc.requestRenderAll();
    deps.endPreview(committed);
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
  return tool === "arrow" || tool === "rect" || tool === "ellipse";
}
