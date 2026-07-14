"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";

type ZoomableImageProps = ComponentProps<"img">;

// メモ内の画像。クリックで画面内に収まる最大サイズの拡大表示を開き、
// もう一度のクリックか Esc で閉じる。
// react-markdown は画像を <p> 内に置くため、オーバーレイは
// <p> に入れられない <div> を body へポータルで逃がす
export function ZoomableImage({ alt, ...props }: ZoomableImageProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="cursor-zoom-in"
        onClick={() => setIsOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...props} alt={alt} />
      </button>
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-4"
            onClick={() => setIsOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={props.src}
              alt={alt}
              className="max-h-full max-w-full"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
