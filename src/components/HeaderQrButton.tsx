"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface HeaderQrButtonProps {
  qrDataUrl: string;
  url: string;
}

// ヘッダー右端の「QR」。クリックで公開サイト URL を埋め込んだ QR を
// オーバーレイ表示し、もう一度のクリックか Esc で閉じる。
export function HeaderQrButton({ qrDataUrl, url }: HeaderQrButtonProps) {
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
        className="text-gray-500 hover:text-gray-900"
        onClick={() => setIsOpen(true)}
      >
        QR
      </button>
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-4"
            onClick={() => setIsOpen(false)}
          >
            <div className="border border-gray-300 bg-white p-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={`QR: ${url}`} width={240} height={240} />
              <div className="mt-1 break-all font-mono text-gray-600">
                {url}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
