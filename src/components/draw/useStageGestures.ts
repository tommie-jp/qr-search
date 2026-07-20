"use client";

// 拡大と送り (docs/36-お絵かき拡張計画.md §4)。
//
// **「移動」道具のときだけ**ジェスチャを受ける。描く道具と同時に有効にすると
// 「1 本指は描画、2 本指は拡大」の振り分けが要り、2 本目の指が着いた瞬間に
// 描きかけのストロークを捨てる処理 (fabric の内部状態に手を入れる) まで
// 必要になる。道具で分ければその難所がまるごと消える。
//
// 送りは **transform であって scroll ではない**。スクロールできる親を canvas の
// 上に置くと、指が canvas の外へ出た瞬間に座標がスクロール量ぶん飛ぶ
// (zoom.ts の冒頭を参照)。

import { useCallback, useEffect, useState } from "react";
import {
  clampPan,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  type PanOffset,
  panForZoom,
  pinchCenter,
  pinchSpan,
} from "@/lib/draw/zoom";

// +/- ボタン 1 回ぶんの倍率
const ZOOM_STEP = 1.5;

// ホイール 1 目盛り (deltaY ≒ 100) で約 1.22 倍。exp を使うのは、上下に
// 同じだけ回したときに正確に元の倍率へ戻るようにするため
const WHEEL_SENSITIVITY = 0.002;

// Firefox はホイールを「行数」(deltaMode = 1) で寄越すことがある。
// px 換算のおおよその係数
const LINE_HEIGHT_PX = 33;

const NO_PAN: PanOffset = { left: 0, top: 0 };

interface UseStageGesturesParams {
  // ジェスチャを受ける枠 (canvas を囲む見えている範囲)
  stageRef: React.RefObject<HTMLElement | null>;
  // 拡大した中身そのもの。送りの上限を測るのに使う
  contentRef: React.RefObject<HTMLElement | null>;
  // 「移動」道具を選んでいるか
  enabled: boolean;
}

export interface StageGestures {
  zoom: number;
  pan: PanOffset;
  zoomBy: (factor: number) => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomStep: number;
}

export function useStageGestures({
  stageRef,
  contentRef,
  enabled,
}: UseStageGesturesParams): StageGestures {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanOffset>(NO_PAN);

  // 送りの上限は「拡大後の中身 − 枠」。中身は倍率を変えた後の寸法で測りたいが、
  // 変えた直後はまだ描き直されていないので、倍率の比から見込みで出す
  const limitFor = useCallback(
    (nextZoom: number, currentZoom: number) => {
      const stage = stageRef.current;
      const content = contentRef.current;
      if (!stage || !content) {
        return null;
      }
      const box = content.getBoundingClientRect();
      const ratio = currentZoom > 0 ? nextZoom / currentZoom : 1;
      return {
        content: { width: box.width * ratio, height: box.height * ratio },
        view: { width: stage.clientWidth, height: stage.clientHeight },
      };
    },
    [stageRef, contentRef],
  );

  const applyZoom = useCallback(
    (nextZoom: number, pointer: { x: number; y: number }, fromZoom: number, fromPan: PanOffset) => {
      const next = clampZoom(nextZoom);
      const moved = panForZoom({ pan: fromPan, pointer, from: fromZoom, to: next });
      const limit = limitFor(next, fromZoom);
      setZoom(next);
      setPan(limit ? clampPan(moved, limit.content, limit.view) : moved);
    },
    [limitFor],
  );

  // 枠の中心を軸に拡大する (ボタン用)
  const zoomBy = useCallback(
    (factor: number) => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      applyZoom(
        zoom * factor,
        { x: stage.clientWidth / 2, y: stage.clientHeight / 2 },
        zoom,
        pan,
      );
    },
    [applyZoom, pan, stageRef, zoom],
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan(NO_PAN);
  }, []);

  // --- ホイールで拡大 (PC) ------------------------------------------------
  // ピンチと違い、ホイールは 1 本指の描画と取り合いにならないので
  // 「移動」道具に限定しない。どの道具のままでもポインタ位置を軸に拡大できる
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      // ブラウザ自体の拡大 (Ctrl+ホイール) や後ろのページのスクロールに流さない
      event.preventDefault();
      const box = stage.getBoundingClientRect();
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * LINE_HEIGHT_PX
          : event.deltaY;
      applyZoom(
        zoom * Math.exp(-delta * WHEEL_SENSITIVITY),
        { x: event.clientX - box.left, y: event.clientY - box.top },
        zoom,
        pan,
      );
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [applyZoom, pan, stageRef, zoom]);

  // --- 「移動」道具のジェスチャ -------------------------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !enabled) {
      return;
    }

    // 枠の左上から測った指の位置。ピンチの軸に使う
    const localPoint = (touch: Touch) => {
      const box = stage.getBoundingClientRect();
      return { x: touch.clientX - box.left, y: touch.clientY - box.top };
    };

    let pinch: {
      span: number;
      center: { x: number; y: number };
      zoom: number;
      pan: PanOffset;
    } | null = null;
    let drag: { x: number; y: number; pan: PanOffset } | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        return;
      }
      drag = null;
      pinch = {
        span: pinchSpan(localPoint(event.touches[0]), localPoint(event.touches[1])),
        center: pinchCenter(localPoint(event.touches[0]), localPoint(event.touches[1])),
        zoom,
        pan,
      };
      event.preventDefault();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2 || pinch.span <= 0) {
        return;
      }
      event.preventDefault();
      const span = pinchSpan(localPoint(event.touches[0]), localPoint(event.touches[1]));
      applyZoom(pinch.zoom * (span / pinch.span), pinch.center, pinch.zoom, pinch.pan);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinch = null;
      }
    };

    // 1 本指のドラッグで送る
    const onPointerDown = (event: PointerEvent) => {
      if (pinch) {
        return;
      }
      drag = { x: event.clientX, y: event.clientY, pan };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || pinch) {
        return;
      }
      const stageBox = { width: stage.clientWidth, height: stage.clientHeight };
      const content = contentRef.current?.getBoundingClientRect();
      const moved = {
        left: drag.pan.left - (event.clientX - drag.x),
        top: drag.pan.top - (event.clientY - drag.y),
      };
      setPan(
        content
          ? clampPan(moved, { width: content.width, height: content.height }, stageBox)
          : moved,
      );
    };

    const endDrag = () => {
      drag = null;
    };

    stage.addEventListener("touchstart", onTouchStart, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd);
    stage.addEventListener("touchcancel", onTouchEnd);
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("pointerleave", endDrag);

    return () => {
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", endDrag);
      stage.removeEventListener("pointercancel", endDrag);
      stage.removeEventListener("pointerleave", endDrag);
    };
  }, [applyZoom, contentRef, enabled, pan, stageRef, zoom]);

  return {
    zoom,
    pan,
    zoomBy,
    resetZoom,
    // clampZoom(Infinity) の形は使わない。かつて isFinite ガードが Infinity を
    // 既定 (1) へ落とし、「＋」が常に無効になっていた
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
    zoomStep: ZOOM_STEP,
  };
}
