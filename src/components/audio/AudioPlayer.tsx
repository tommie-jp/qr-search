"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  attachmentShareName,
  canShareFiles,
  isShareAborted,
  isShareActivationLost,
  shareFile,
} from "@/lib/shareFile";
import { SECONDARY_BUTTON_CLASS } from "../ui";

interface AudioPlayerProps {
  src: string;
  // 挿入時の alt (録音の日時など)。共有ファイル名の元にする
  label: string;
}

// 取り込んだ音声のバイト列と mime。共有シートへ渡すために一度だけ取得して持つ
interface AudioBytes {
  bytes: Uint8Array;
  mime: string;
}

// 本文の音声プレイヤー + 共有ボタン。
//
// **なぜ共有ボタンが要るか**: iOS は <img> の長押しでは共有メニューを出すが、
// <audio> プレイヤーには出さない (実機で確認)。ホーム画面から起動した PWA
// (standalone) では、ノートに録った音声を Files や他アプリへ出す手段が他に
// 無くなるため、自前で口を作る (docs/12-添付ファイル種類拡張メモ.md)。
//
// PDF (PdfViewerModal) の共有と同じ流儀。違いは、PDF はバイト列が表示のために
// 既に手元にあるのに対し、音声は preload="metadata" で実体を持っていない点。
// 共有の直前に fetch すると iOS が transient activation 切れで弾くことがあるので、
// 取得したバイト列を手元に残し、切れたら「もう一度」で再送する 2 段構えにする。
export function AudioPlayer({ src, label }: AudioPlayerProps) {
  // ファイル共有に対応する環境でだけボタンを出す (displayMode と同じ「判るまで
  // 出さない」流儀)。share があってもファイルを受けない環境があるので canShare で見る
  const canShare = useSyncExternalStore(
    () => () => {},
    () => canShareFiles(),
    () => false,
  );

  // 一度取得したバイト列は保持する。iOS で activation が切れたときの再送
  // (2 回目のタップ) を、通信なし = 操作直後のまま済ませるため
  const cached = useRef<AudioBytes | null>(null);
  // 'retry' … activation 切れで一度弾かれた。もう一度押せばキャッシュから送れる
  const [phase, setPhase] = useState<"idle" | "busy" | "retry">("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchBytes = async (): Promise<AudioBytes> => {
    if (cached.current) {
      return cached.current;
    }
    // 同一オリジンなので Cookie は既定で付く (認証つき配信もそのまま取れる)
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(`音声を取得できませんでした (HTTP ${res.status})`);
    }
    const buffer = await res.arrayBuffer();
    const value: AudioBytes = {
      bytes: new Uint8Array(buffer),
      // 配信側が検証済みの Content-Type をそのまま使う
      mime: res.headers.get("content-type") ?? "application/octet-stream",
    };
    cached.current = value;
    return value;
  };

  const handleShare = async () => {
    setError(null);
    setPhase("busy");
    try {
      const { bytes, mime } = await fetchBytes();
      const name = attachmentShareName(src, label, "録音");
      await shareFile(bytes, name, mime);
      setPhase("idle");
    } catch (e) {
      if (isShareAborted(e)) {
        // 共有シートを閉じただけ。バイト列は保持したまま idle に戻す
        setPhase("idle");
        return;
      }
      if (isShareActivationLost(e)) {
        // fetch で操作直後の許可が切れた。バイト列は取れているので、
        // もう一度押せば通信なしで送れる
        setPhase("retry");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  };

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        {/* autoplay は付けない。preload は metadata (開いただけで全データを取らない) */}
        <audio
          controls
          preload="metadata"
          src={src}
          className="w-full max-w-md"
        />
        {canShare && (
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={phase === "busy"}
            className={`shrink-0 ${SECONDARY_BUTTON_CLASS}`}
          >
            {phase === "retry" ? "もう一度" : "共有"}
          </button>
        )}
      </span>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </span>
  );
}
