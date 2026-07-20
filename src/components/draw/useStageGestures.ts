"use client";

// 拡大と移動 (docs/36-お絵かき拡張計画.md §4)。
//
// **「手」道具のときだけ**ジェスチャを受ける。描く道具と同時に有効にすると
// 「1 本指は描画、2 本指は拡大」の振り分けが要り、2 本目の指が着いた瞬間に
// 描きかけのストロークを捨てる処理 (fabric の内部状態に手を入れる) まで
// 必要になる。道具で分ければその難所がまるごと消える。
//
// 拡大は CSS の表示倍率で行う (zoom.ts の冒頭を参照)。はみ出した分は枠の
// スクロールで送るので、パンは scrollLeft / scrollTop を動かすだけで済む。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  clampZoom,
  pinchCenter,
  pinchSpan,
  type ScrollOffset,
  scrollForZoom,
} from "@/lib/draw/zoom";

// +/- ボタン 1 回ぶんの倍率
const ZOOM_STEP = 1.5;

interface UseStageGesturesParams {
  stageRef: React.RefObject<HTMLElement | null>;
  // 「手」道具を選んでいるか
  enabled: boolean;
}

export interface StageGestures {
  zoom: number;
  zoomBy: (factor: number) => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomStep: number;
}

export function useStageGestures({
  stageRef,
  enabled,
}: UseStageGesturesParams): StageGestures {
  const [zoom, setZoom] = useState(1);
  // 倍率を変えると中身の大きさが変わる。先にスクロールを書いても、まだ
  // 小さいままの中身に合わせて丸められてしまうので、描画の後に当てる
  const pendingScrollRef = useRef<ScrollOffset | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const pending = pendingScrollRef.current;
    if (!stage || !pending) {
      return;
    }
    stage.scrollLeft = pending.left;
    stage.scrollTop = pending.top;
    pendingScrollRef.current = null;
  }, [zoom, stageRef]);

  // 枠の中心を軸に拡大する (ボタン用)
  const zoomBy = useCallback(
    (factor: number) => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      setZoom((current) => {
        const next = clampZoom(current * factor);
        pendingScrollRef.current = scrollForZoom({
          scroll: { left: stage.scrollLeft, top: stage.scrollTop },
          pointer: { x: stage.clientWidth / 2, y: stage.clientHeight / 2 },
          from: current,
          to: next,
        });
        return next;
      });
    },
    [stageRef],
  );

  const resetZoom = useCallback(() => {
    pendingScrollRef.current = { left: 0, top: 0 };
    setZoom(1);
  }, []);

  // --- 「手」道具のジェスチャ ---------------------------------------------
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

    // 2 本指: つまんだ点を動かさずに拡大する
    let pinch: {
      span: number;
      center: { x: number; y: number };
      zoom: number;
      scroll: ScrollOffset;
    } | null = null;
    // 1 本指: つかんで送る
    let pan: { x: number; y: number; scroll: ScrollOffset } | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pan = null;
        pinch = {
          span: pinchSpan(localPoint(event.touches[0]), localPoint(event.touches[1])),
          center: pinchCenter(
            localPoint(event.touches[0]),
            localPoint(event.touches[1]),
          ),
          zoom,
          scroll: { left: stage.scrollLeft, top: stage.scrollTop },
        };
        event.preventDefault();
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) {
        return;
      }
      event.preventDefault();
      const span = pinchSpan(
        localPoint(event.touches[0]),
        localPoint(event.touches[1]),
      );
      if (pinch.span <= 0) {
        return;
      }
      const next = clampZoom(pinch.zoom * (span / pinch.span));
      pendingScrollRef.current = scrollForZoom({
        scroll: pinch.scroll,
        pointer: pinch.center,
        from: pinch.zoom,
        to: next,
      });
      setZoom(next);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinch = null;
      }
    };

    // 1 本指のドラッグで送る。fabric の器は touch-action: none なので
    // ブラウザ任せのスクロールは起きず、ここで自分で動かす
    const onPointerDown = (event: PointerEvent) => {
      if (pinch) {
        return;
      }
      pan = {
        x: event.clientX,
        y: event.clientY,
        scroll: { left: stage.scrollLeft, top: stage.scrollTop },
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pan || pinch) {
        return;
      }
      stage.scrollLeft = pan.scroll.left - (event.clientX - pan.x);
      stage.scrollTop = pan.scroll.top - (event.clientY - pan.y);
    };

    const endPan = () => {
      pan = null;
    };

    stage.addEventListener("touchstart", onTouchStart, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd);
    stage.addEventListener("touchcancel", onTouchEnd);
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", endPan);
    stage.addEventListener("pointercancel", endPan);
    stage.addEventListener("pointerleave", endPan);

    return () => {
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", endPan);
      stage.removeEventListener("pointercancel", endPan);
      stage.removeEventListener("pointerleave", endPan);
    };
  }, [enabled, stageRef, zoom]);

  return {
    zoom,
    zoomBy,
    resetZoom,
    canZoomIn: zoom < clampZoom(Number.POSITIVE_INFINITY),
    canZoomOut: zoom > clampZoom(Number.NEGATIVE_INFINITY),
    zoomStep: ZOOM_STEP,
  };
}
