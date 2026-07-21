"use client";

import { useState } from "react";
import { thumbUrl } from "@/lib/memoImages";

interface RowThumbProps {
  // 添付の保存名 (`<UUID>.<ext>`)。?thumb=1 で縮小版を配る
  name: string;
  // 動画なら true。poster を出しつつ ▶ バッジを重ね、poster が無ければ
  // ビデオアイコンで代替する
  isVideo: boolean;
  // width/height 属性 (読み込み前から場所を取らせ、届いた瞬間の飛び跳ねを防ぐ)
  sizePx: number;
  // 大きさの Tailwind クラス (size-10 / size-24)
  sizeClass: string;
}

// 一覧の 1 件のサムネ (docs/23-検索結果表示モード計画.md §2, docs/14 §Phase4)。
//
// 画像は従来どおり ?thumb=1 の縮小版を <img> で出す。動画も poster を同じ
// ?thumb=1 で出せるが、**poster が無い動画がある** (iOS 旧録画・生成失敗)。
// サーバは本文の文字列だけからは poster の有無を判定できない (DB を引く必要が
// ある) ため、クライアントで <img> の onError を拾い、動画アイコンへ切り替える。
// これで一覧に壊れた画像アイコンが出ず、動画であることは必ず判る。
export function RowThumb({ name, isVideo, sizePx, sizeClass }: RowThumbProps) {
  // 動画で poster が 404 だったら true。アイコン表示に切り替える
  const [posterFailed, setPosterFailed] = useState(false);
  const showIcon = isVideo && posterFailed;

  return (
    <span
      className={`relative ${sizeClass} shrink-0 self-center overflow-hidden rounded bg-gray-100`}
    >
      {showIcon ? (
        <VideoIcon />
      ) : (
        <>
          {/* next/image は使えない (画像 API はログイン必須で optimizer に
              Cookie が付かない)。縮小は保存時に済ませてある (thumbnail.ts)。
              alt="" … 装飾。すぐ左のタイトルが中身を説明している */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(name)}
            alt=""
            width={sizePx}
            height={sizePx}
            loading="lazy"
            decoding="async"
            onError={isVideo ? () => setPosterFailed(true) : undefined}
            className={`${sizeClass} block object-cover`}
          />
          {isVideo && <PlayBadge />}
        </>
      )}
    </span>
  );
}

// poster の中央に重ねる小さな再生バッジ (動画だと一目で判るように)。
function PlayBadge() {
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-1/3 min-h-4 min-w-4 drop-shadow"
        fill="white"
      >
        <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.45)" />
        <path d="M9 7.5v9l7-4.5z" fill="white" />
      </svg>
    </span>
  );
}

// poster が無い動画のアイコン (ビデオカメラ風)。枠いっぱいの灰色地に白の記号。
function VideoIcon() {
  return (
    <span
      aria-label="動画"
      className="absolute inset-0 flex items-center justify-center text-gray-400"
    >
      <svg viewBox="0 0 24 24" className="size-2/3" fill="currentColor">
        <path d="M4 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm13 3.5 4-2.5v10l-4-2.5z" />
      </svg>
    </span>
  );
}
