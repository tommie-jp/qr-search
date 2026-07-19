"use client";

import { useState } from "react";
import { COMPACT_SECONDARY_BUTTON_CLASS } from "@/components/ui";

// ログの控えを消すボタン (docs/30-ブラウザログ計画.md §7)。
// 実機調査では「一度消してから再現操作をする」と、/logs に並ぶのが今回の
// 再現ぶんだけになり、どこからが新しいログか数えなくて済む。
//
// useRouter は使わない: /logs の一覧はサーバ側で描くので再読み込みで足り、
// hook を持ち込むとページの静的描画テスト (page.test.tsx) が router の
// マウントを要求して壊れる
export function ClearLogsButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/logs/clear", { method: "POST" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      // サーバ側の控えが消えたので、一覧を読み直して空にする
      location.reload();
    } catch (e) {
      setError(
        `ログを消去できませんでした (${e instanceof Error ? e.message : String(e)})`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={clear}
        disabled={busy}
        className={COMPACT_SECONDARY_BUTTON_CLASS}
      >
        {busy ? "消去中…" : "ログをクリア"}
      </button>
    </span>
  );
}
