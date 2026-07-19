"use client";

import {
  prepareZXingModule,
  Scanner,
  type IDetectedBarcode,
  type IScannerError,
  type ScannerErrorKind,
} from "@yudiel/react-qr-scanner";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SCAN_FORMATS } from "@/lib/scanFormats";
import { resolveScanPath } from "@/lib/scanResult";

// 読み取りエンジン (wasm) の取得先を自前配信へ向ける (docs/09-スキャン計画.md §5)。
// 既定は jsDelivr の CDN で、外部依存を作りたくない。
// public/zxing/ へはビルド時に scripts/copyZxingWasm.mjs が複製する。
//
// prepareZXingModule はモジュール読み込み時 = 最初の読み取りより前に呼ぶ必要がある。
// このファイル自体が動的 import されるので、Scanner が描画される前に必ず通る。
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : `${prefix}${path}`,
  },
});

// カメラを開けなかった理由。黙って真っ黒な画面を見せると原因を追えないので、
// 何が起きたか・どうすれば直るかまで書く。
// Record にして ScannerErrorKind の追加を型で検出させる (取りこぼし防止)
const ERROR_MESSAGES: Record<ScannerErrorKind, string> = {
  "permission-denied":
    "カメラの使用が許可されていません。ブラウザのサイト設定でカメラを許可してください。",
  "no-camera": "カメラが見つかりません。",
  "in-use": "他のアプリがカメラを使用中です。閉じてからもう一度お試しください。",
  overconstrained: "この端末のカメラでは条件を満たせませんでした。",
  // https でないと getUserMedia 自体が使えない (docs/09-スキャン計画.md §6)
  "insecure-context": "カメラは https でしか使えません。https でアクセスしてください。",
  unsupported: "このブラウザはカメラのスキャンに対応していません。",
  aborted: "カメラの起動が中断されました。",
  security: "セキュリティ設定によりカメラを開けませんでした。",
  "type-error": "カメラの起動に失敗しました。",
  unknown: "カメラを開けませんでした。",
};

interface ScannerModalProps {
  // QR シールに焼かれている URL のホスト (QR_BASE_URL 由来)
  stickerHost: string;
  onClose: () => void;
}

// 全画面のカメラビュー。QR / バーコードを 1 つ読んだら閉じて遷移する。
// 遷移先の判定は lib/scanResult.ts の純関数に置く (ここは配線だけ)。
export function ScannerModal({ stickerHost, onClose }: ScannerModalProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 読み取り成功から unmount までの間に onScan が再び発火しても
  // 二重に push しないようにする
  const isHandled = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleScan = (codes: IDetectedBarcode[]) => {
    if (isHandled.current) {
      return;
    }
    const rawValue = codes[0]?.rawValue ?? "";
    // シールのホストと、いま開いているホストの両方を部品 URL と認める。
    // 実機確認では localhost や LAN の IP で開きつつ本番シールを読むため
    const path = resolveScanPath(rawValue, [stickerHost, window.location.hostname]);
    if (!path) {
      return; // 空の読み取り。カメラは開けたままにして読み直させる
    }
    isHandled.current = true;
    // 対応端末だけの振動。読めた手応えを返す (非対応でも何も起きないだけ)
    navigator.vibrate?.(50);
    onClose();
    router.push(path);
  };

  const handleError = (e: IScannerError) => {
    setError(ERROR_MESSAGES[e.kind] ?? ERROR_MESSAGES.unknown);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-3 text-white">
        <span>QR・バーコードをかざす</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-white/20 px-4 py-2 font-medium"
          aria-label="スキャンを閉じる"
        >
          閉じる
        </button>
      </div>

      {/* min-h-0 + overflow-y-auto … エラー文とカメラ枠が並ぶと、スマホ横持ち
          (視界 300px 台) では入り切らないことがある (docs/31 §12)。器の中を
          スクロールできるようにしておく (ImageSearchModal と同じ作り)。
          縦の中央寄せは justify-center ではなく内側の my-auto で行う —
          justify-center はあふれた分が上下とも画面外に出て、スクロールしても
          上端に届かない (auto マージンはあふれると 0 に潰れるので安全) */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-4">
        <div className="my-auto flex w-full flex-col items-center gap-3">
          {/* エラーは Scanner を差し替えず上に出す。ライブラリはカメラ起動の失敗も
              トーチ切り替えの失敗も同じ onError に流すため、差し替えると
              「ライトを点けようとしただけでカメラが死ぬ」ことになる。
              起動に失敗したときは Scanner 側が黒いままなので、これで困らない */}
          {error && (
            <p
              role="alert"
              className="max-w-sm rounded bg-red-900/80 px-3 py-2 text-center text-white"
            >
              {error}
            </p>
          )}
          {/* max-w は 28rem に加えて視界の高さ (dvh) でも縛る。スマホ横持ちでは
              高さが 300px 台になり、幅 28rem のカメラ映像 (4:3 で高さ 336px) が
              画面から溢れる (docs/31 §12)。幅 ≤ 75dvh なら 4:3 でも高さ ≤ 56dvh
              で、上の見出し行と合わせても収まる */}
          <div className="w-full max-w-[min(28rem,75dvh)]">
            <Scanner
              formats={SCAN_FORMATS}
              onScan={handleScan}
              onError={handleError}
              components={{ finder: true, torch: true }}
              classNames={{ container: "overflow-hidden rounded" }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
