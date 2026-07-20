"use client";

// 拡大と送り (docs/36-お絵かき拡張計画.md §4)。
//
// - **2 本指はどの道具でも効く**。開けば拡大、つまんだまま動かせば送り。
//   2 本目の指が着いた瞬間に onTwoFingerStart で描きかけの線を捨てさせる
//   ので、描く道具と取り合いにならない
// - **1 本指ドラッグでの送りは「移動」道具のときだけ** (1 本指は描画のもの)
// - **ホイール (PC) もどの道具でも効く**。ポインタ位置を軸に拡大
//
// 送りは transform であって scroll ではない (zoom.ts の冒頭を参照)。
//
// 実装の要: **ハンドラは state を閉じ込めず ref を読む**。進行中のピンチや
// ドラッグの状態は effect のローカルに在るので、依存に zoom / pan を入れると
// 1 目盛り動くたびにリスナが張り直されてジェスチャが死ぬ (実際に起きた不具合)。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampPan,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  type PanOffset,
  panForPinch,
  panForZoom,
  pinchCenter,
  pinchSpan,
} from "@/lib/draw/zoom";
import type { DrawPoint } from "@/lib/draw/shapes";

// +/- ボタン 1 回ぶんの倍率
const ZOOM_STEP = 1.5;

// ホイール 1 目盛り (deltaY ≒ 100) で約 1.22 倍。exp を使うのは、上下に
// 同じだけ回したときに正確に元の倍率へ戻るようにするため
const WHEEL_SENSITIVITY = 0.002;

// Firefox はホイールを「行数」(deltaMode = 1) で寄越すことがある。px 換算の係数
const LINE_HEIGHT_PX = 33;

const NO_PAN: PanOffset = { left: 0, top: 0 };

interface UseStageGesturesParams {
  // ジェスチャを受ける枠 (canvas を囲む見えている範囲)
  stageRef: React.RefObject<HTMLElement | null>;
  // 拡大した中身そのもの。送りの上限を測るのに使う
  contentRef: React.RefObject<HTMLElement | null>;
  // 「移動」道具か (1 本指ドラッグでの送りを受けるか)
  dragPanEnabled: boolean;
  // 2 本指ジェスチャが始まった瞬間に呼ぶ。1 本目の指で始まってしまった
  // 描きかけの線・図形を捨てるため
  onTwoFingerStart: () => void;
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
  dragPanEnabled,
  onTwoFingerStart,
}: UseStageGesturesParams): StageGestures {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanOffset>(NO_PAN);
  // ハンドラから読む最新値。state はレンダリング用で、ここが正
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const onTwoFingerStartRef = useRef(onTwoFingerStart);
  useEffect(() => {
    onTwoFingerStartRef.current = onTwoFingerStart;
  }, [onTwoFingerStart]);

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

  // 唯一の書き込み口。ref と state を同時に更新して食い違いを作らない
  const commit = useCallback(
    (nextZoom: number, rawPan: PanOffset, fromZoom: number) => {
      const limit = limitFor(nextZoom, fromZoom);
      const nextPan = limit ? clampPan(rawPan, limit.content, limit.view) : rawPan;
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
    },
    [limitFor],
  );

  // ポインタ位置を軸に拡大 (ホイール・ボタン用)
  const zoomAt = useCallback(
    (factor: number, pointer: DrawPoint) => {
      const from = zoomRef.current;
      const next = clampZoom(from * factor);
      const moved = panForZoom({ pan: panRef.current, pointer, from, to: next });
      commit(next, moved, from);
    },
    [commit],
  );

  // 枠の中心を軸に拡大 (ボタン用)
  const zoomBy = useCallback(
    (factor: number) => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      zoomAt(factor, { x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
    },
    [stageRef, zoomAt],
  );

  const resetZoom = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = NO_PAN;
    setZoom(1);
    setPan(NO_PAN);
  }, []);

  // --- 2 本指 (全道具) と 1 本指ドラッグ (「移動」のみ) --------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    // 枠の左上から測った指の位置
    const localPoint = (touch: Touch): DrawPoint => {
      const box = stage.getBoundingClientRect();
      return { x: touch.clientX - box.left, y: touch.clientY - box.top };
    };

    // 進行中のジェスチャ。effect が張り直されない限り生きる (依存に注意)
    let pinch: {
      span: number;
      center: DrawPoint;
      zoom: number;
      pan: PanOffset;
    } | null = null;
    let drag: { x: number; y: number; pan: PanOffset } | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        return;
      }
      // iOS Safari のページ自体の拡大に流さない
      event.preventDefault();
      drag = null;
      onTwoFingerStartRef.current();
      pinch = {
        span: pinchSpan(localPoint(event.touches[0]), localPoint(event.touches[1])),
        center: pinchCenter(localPoint(event.touches[0]), localPoint(event.touches[1])),
        zoom: zoomRef.current,
        pan: panRef.current,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2 || pinch.span <= 0) {
        return;
      }
      event.preventDefault();
      const a = localPoint(event.touches[0]);
      const b = localPoint(event.touches[1]);
      // 開き具合で倍率、中心の移動で送り。どちらも開始時を基準に測る
      // (直前フレーム基準だと誤差が積もって流れる)
      const next = clampZoom(pinch.zoom * (pinchSpan(a, b) / pinch.span));
      const moved = panForPinch({
        pan: pinch.pan,
        from: pinch.zoom,
        startCenter: pinch.center,
        currentCenter: pinchCenter(a, b),
        to: next,
      });
      commit(next, moved, pinch.zoom);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinch = null;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!dragPanEnabled || pinch) {
        return;
      }
      drag = { x: event.clientX, y: event.clientY, pan: panRef.current };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || pinch) {
        return;
      }
      const moved = {
        left: drag.pan.left - (event.clientX - drag.x),
        top: drag.pan.top - (event.clientY - drag.y),
      };
      commit(zoomRef.current, moved, zoomRef.current);
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
  }, [commit, dragPanEnabled, stageRef]);

  // --- ホイールで拡大 (PC・全道具) ----------------------------------------
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
      zoomAt(Math.exp(-delta * WHEEL_SENSITIVITY), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [stageRef, zoomAt]);

  return {
    zoom,
    pan,
    zoomBy,
    resetZoom,
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
    zoomStep: ZOOM_STEP,
  };
}
