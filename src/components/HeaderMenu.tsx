"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ヘッダーのハンバーガーメニュー (docs/11-アプリ的UIUX計画.md §6)。
//
// ログイン中は右側に 6 項目 (QR / GitHub / ユーザー名 / ログ / パスキー /
// ログアウト) が並び、iPhone の幅では**1 文字ずつ縦に折り返れて崩れていた**。
// 項目は今後も増える側なので、畳める入れ物にする。
//
// **画面幅で出し分けない。** 「狭いときだけメニュー」にするとコードパスが
// 2 本になり、片方だけ壊れる (今回の崩れもデスクトップでは見えなかった)。
// 全幅で同じ形にして、壊れ方を 1 通りに保つ。
//
// 中身は children で受け取る。こうすると HeaderMenu 自身はログイン状態を
// 知らずに済み、layout.tsx (Server Component) が項目を組み立てられる
// (LogoutButton などのクライアント側の部品もそのまま入れられる)。
export function HeaderMenu({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape で閉じる。開いているときだけ登録する
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        // 閉じたら開閉ボタンへ戻す。キーボードで辿っている人が
        // 行き場を失わないようにする
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="メニュー"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
        // relative z-40 で外側タップ用の覆い (z-30) より上に出す。
        // 下に居ると ✕ を押しても覆いがタップを横取りし、この onClick が
        // 動かない。結果的に閉じはする (覆いが閉じる) が、押した物と
        // 動いた物が食い違う状態になり、開閉が二重に走る余地も残る
        className="relative z-40 inline-flex min-h-11 items-center rounded px-2 text-gray-500 transition-colors hover:text-gray-900 active:bg-gray-100"
      >
        {/* アイコンは inline SVG で持つ。この 2 本のためにライブラリを
            足さない (currentColor なので文字色にそのまま追従する) */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          {isOpen ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {isOpen && (
        <>
          {/* 外側タップで閉じる覆い。document のリスナーではなく実体のある
              要素にするのは、iOS Safari で body へのタップが拾えないことが
              あるため。透明だが確実にタップを受ける。

              **body へ portal するのが要点。** ヘッダーには backdrop-blur が
              掛かっており、backdrop-filter を持つ要素は position:fixed の
              包含ブロックになる。ヘッダーの中に置くと inset-0 が
              「画面全体」ではなく「ヘッダーの矩形」になり、覆いが本文まで
              届かない。実際それで、メニューを開いたまま本文のリンクを
              押せてしまい、閉じずに画面が遷移した。

              z-10 = ヘッダー (z-20) より下。本文より上なので外側タップは
              拾えるうえ、ヘッダー自身の操作 (✕) は覆いに邪魔されない */}
          {createPortal(
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
              aria-hidden
            />,
            document.body,
          )}
          {/* 項目を押したら閉じる。個々の項目に閉じる処理を配らず、
              バブリングを 1 か所で受けることで、項目が増えても閉じ忘れない。

              **例外は「自前の UI 状態を持つ項目」** (HeaderQrButton の
              オーバーレイ、PasskeyLoginButton の進行中・エラー表示)。
              閉じるとその部品ごと unmount され、開いたはずのものや
              出したはずのエラーが道連れに消える。該当する部品は自分の
              onClick で stopPropagation してメニューを開いたままにする */}
          <div
            role="menu"
            onClick={() => setIsOpen(false)}
            className="absolute right-0 top-full z-40 mt-1 flex w-56 flex-col gap-0.5 rounded border border-gray-300 bg-white p-1 shadow-lg"
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
