// 近接撮影のためのカメラ選択 (docs/16-録画の近接フォーカス計画.md)。
//
// iOS Safari は focusMode / focusDistance (手動フォーカス) の MediaTrackConstraints
// に対応しない。一方 iOS の「マクロ (近接)」は実体が **超広角レンズ** なので、
// 手動フォーカスの代わりに **レンズそのものを超広角へ選び直す** ことで近接撮影を
// 実現する。単一の物理レンズを deviceId で名指しすると、iOS 18 が背面カメラで
// 起こすレンズの自動切替も止まり、近接時に AF が迷う時間も短くなる。
//
// enumerateDevices のラベルは **gUM 許可後にしか埋まらない** ため、超広角の
// 検出はカメラを開いた後に行う (呼び出し側の責務)。

// 背面超広角カメラのラベル。iOS Safari は "Back Ultra Wide Camera"、日本語 UI や
// 一部 Android は "超広角"。どちらでも拾えるようにする。
const ULTRA_WIDE_LABEL = /ultra.?wide|超広角/i;

// 超広角は 0.5x 相当で画角が広すぎる。zoom 対応端末なら 1x 近くへクロップし直す。
export const NEAR_FOCUS_ZOOM = 2;

// zoom は標準の TS DOM 型に無い (実験的 API)。必要な形だけを最小に写す。
interface ZoomCapability {
  min: number;
  max: number;
}
interface ZoomCapabilities {
  zoom?: ZoomCapability;
}
interface ZoomConstraintSet {
  zoom: number;
}

// 背面超広角カメラの deviceId を返す。見つからない・列挙できない端末では null
// (= 近接ボタンを出さない)。PC や多くの Android、旧 iPhone はここで null になる。
export async function findUltraWideDeviceId(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }
  let devices: MediaDeviceInfo[];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    // 列挙できないなら近接は諦める (通常カメラで録れれば十分)
    return null;
  }
  const match = devices.find(
    (d) => d.kind === "videoinput" && ULTRA_WIDE_LABEL.test(d.label),
  );
  return match?.deviceId ?? null;
}

// 超広角トラックの画角を zoom で 1x 近くへ寄せる。**zoom 非対応なら何もしない**
// (多くの端末が非対応。ここで失敗させると近接そのものが使えなくなる)。
export async function applyNearFocusZoom(
  track: MediaStreamTrack,
): Promise<void> {
  const caps = track.getCapabilities?.() as ZoomCapabilities | undefined;
  const zoom = caps?.zoom;
  if (!zoom) {
    return;
  }
  const target = Math.min(NEAR_FOCUS_ZOOM, zoom.max);
  if (target < zoom.min) {
    return;
  }
  try {
    await track.applyConstraints({
      advanced: [{ zoom: target } as unknown as ZoomConstraintSet],
    } as MediaTrackConstraints);
  } catch {
    // zoom 指定が拒まれても、超広角レンズ自体で近接は成立する。無視して続行
  }
}
