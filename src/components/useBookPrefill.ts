"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { BookSummary } from "@/lib/book";
import { scanRegisterMemo } from "@/lib/scanRegister";

// 自分のサーバの /api/books/<isbn> を引く。書誌 API を直接叩かないのは
// NDL サーチのため (理由は src/app/api/books/[isbn]/route.ts)。
// 取得ごとの上限もサーバ側が持つ (bookLookup.ts)。
async function fetchBook(
  isbn: string,
  signal: AbortSignal,
): Promise<BookSummary | null> {
  const res = await fetch(`/api/books/${encodeURIComponent(isbn)}`, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(body?.error ?? `書誌の取得に失敗しました (HTTP ${res.status})`);
  }
  return body.data;
}

// ISBN をスキャンして開いた新規ノートに、書誌を流し込む
// (設計は docs/13-書誌自動取得計画.md)。
//
// isbn が undefined のとき (既存ノート・ISBN 以外のコード・手打ちの編集) は
// 何もしない。
export function useBookPrefill(
  isbn: string | undefined,
  setMemo: Dispatch<SetStateAction<string>>,
  // 「まだ何も書いていない」ことを表す本文。これと違っていたら書き換えない
  pristine: string,
): void {
  useEffect(() => {
    if (!isbn) {
      return;
    }
    const abort = new AbortController();
    fetchBook(isbn, abort.signal)
      .then((book) => {
        if (!book) {
          // どの API にも無かった。事前入力のままにして手で書いてもらう
          // (導線は止めない)
          return;
        }
        // 取得を待つ間に打ち始めていたら書き換えない。遅れて返ってきた書誌が
        // 手書きを消すのがこの機能で最悪の事故なので、prev を見て判断する
        setMemo((prev) => (prev === pristine ? scanRegisterMemo(isbn, book) : prev));
      })
      .catch((err) => {
        if (abort.signal.aborted) {
          return; // ページを離れただけ
        }
        // 握り潰さずに残す。UI には出さない (書誌が載らないことで分かるし、
        // 出しても手で書く以外にできることがない)
        console.warn("書誌の取得に失敗しました", err);
      });
    return () => abort.abort("unmount");
  }, [isbn, setMemo, pristine]);
}
