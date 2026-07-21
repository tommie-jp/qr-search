// 動画の poster (先頭フレーム) を WebP にしてクライアントで作る
// (docs/14-動画挿入計画.md §Phase3)。サーバに ffmpeg を持ち込まずに一覧・
// <video poster> 用のサムネを用意するための唯一の経路。
//
// **失敗しても null を返す** (throw しない)。poster はあれば嬉しい派生物で、
// これのためにアップロードを止める価値はない (画像の makeThumbnail と同じ流儀)。
// iOS カメラロールの HEVC など、そのブラウザがデコードできない動画では
// 先頭フレームを描けず null になる — その場合 poster 無しで保存される。
//
// **thumbnail.ts (sharp) を import しないこと。** これはクライアント
// (MemoEditorInner) から読まれるモジュールで、sharp を引き込むと Node 専用の
// `fs` がクライアントバンドルに入って壊れる (E2E で 500 になり判明)。サーバは
// 受け取った poster を makeThumbnail で作り直す (THUMB_MAX_PX へ再縮小) ので、
// ここの縮小は「送信量を抑える前処理」でよく、寸法を厳密に揃える必要はない。

// クライアント側の先頭フレーム縮小の一辺 (px)。サーバの THUMB_MAX_PX (384) と
// 揃えてあるが、独立した定数として持つ (sharp を引き込まないため)。
const POSTER_MAX_PX = 384;

// 先頭フレームの取得を待つ上限。壊れた動画・デコードできない動画で
// 永久に待たないための保険。モバイルのデコードを見込んで少し長めにする。
const LOAD_TIMEOUT_MS = 8000;

// 真っ黒な 1 フレーム目を避けるため、ごく短い位置へシークしてから描く。
const SEEK_TARGET_SEC = 0.1;

// 出力は **JPEG**。canvas.toBlob('image/webp') は Safari (iOS) が出せず
// PNG に化けるため、全ブラウザが確実に出せる JPEG にする。サーバが sharp で
// webp へ作り直すので (uploads.ts isValidVideoThumb / attachmentStore)、
// ここが webp である必要はない。
const POSTER_MIME = "image/jpeg";
const POSTER_QUALITY = 0.85;

// 縦横比を保ったまま POSTER_MAX_PX の箱に収めた描画サイズを求める。
function fitInside(width: number, height: number): { w: number; h: number } {
  if (width <= 0 || height <= 0) {
    return { w: POSTER_MAX_PX, h: POSTER_MAX_PX };
  }
  const scale = Math.min(1, POSTER_MAX_PX / Math.max(width, height));
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

// 動画ファイルから先頭フレームの WebP サムネ (Blob) を作る。作れなければ null。
export async function makeVideoPoster(file: File): Promise<Blob | null> {
  if (typeof document === "undefined") {
    return null;
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  // 音を出さず、勝手に全画面へ行かせず、実データまで読ませる (preload=metadata
  // だと描けるフレームが揃わないことがある)
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    return await new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (result: Blob | null) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        video.pause();
        resolve(result);
      };

      const timer = window.setTimeout(() => finish(null), LOAD_TIMEOUT_MS);

      const draw = () => {
        try {
          const { w, h } = fitInside(video.videoWidth, video.videoHeight);
          if (w === 0 || h === 0) {
            finish(null); // まだフレーム寸法が無い (描けない)
            return;
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            finish(null);
            return;
          }
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob((blob) => finish(blob), POSTER_MIME, POSTER_QUALITY);
        } catch {
          // CORS 汚染・デコード不可などで描けない場合。poster 無しで続行
          finish(null);
        }
      };

      // 描けるフレームが来たら、先頭付近へシークしてから描く (真っ黒回避)。
      // seek 不可・duration 不正な録画では、その場のフレームをそのまま描く。
      video.onloadeddata = () => {
        const canSeek =
          Number.isFinite(video.duration) && video.duration > SEEK_TARGET_SEC;
        if (canSeek && Math.abs(video.currentTime - SEEK_TARGET_SEC) > 0.001) {
          try {
            video.currentTime = SEEK_TARGET_SEC; // → onseeked → draw
          } catch {
            draw();
          }
        } else {
          draw();
        }
      };
      video.onseeked = draw;
      video.onerror = () => finish(null);

      // iOS はフレームのデコードを再生で促さないと canvas に描けないことがある。
      // muted なので自動再生は許される。失敗は無視 (onloadeddata 側で描く)
      void video.play?.().catch(() => {});
    });
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}
