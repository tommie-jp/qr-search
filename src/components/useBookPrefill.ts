"use client";

import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
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

// 取得の途中経過。文言は呼び出し側 (MemoEditor) が決める。
//   idle     … ISBN ではない (取得しない)
//   loading  … 取得中
//   loaded   … 取得して本文に入れた
//   skipped  … 取得できたが、打ち始めていたので入れなかった
//   notFound … どの API にも無かった
//   error    … 通信・サーバの失敗
export type BookPrefillStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "skipped"
  | "notFound"
  | "error";

interface BookPrefillOptions {
  // 新規登録するコードが ISBN のときだけ渡す
  isbn?: string;
  // いまの本文 (打ち始めたかの判定に使う)
  value: string;
  // 「まだ何も書いていない」ことを表す本文
  pristine: string;
  setMemo: Dispatch<SetStateAction<string>>;
}

// ISBN をスキャンして開いた新規ノートに、書誌を流し込む
// (設計は docs/13-書誌自動取得計画.md)。
//
// isbn が undefined のとき (既存ノート・ISBN 以外のコード・手打ちの編集) は
// 何もしない。
export function useBookPrefill({
  isbn,
  value,
  pristine,
  setMemo,
}: BookPrefillOptions): BookPrefillStatus {
  // 最初の描画から「取得中」を出す。effect (取得開始) を待って出すと、
  // 一瞬だけ無表示になるうえ、effect の中で同期に setState することになる。
  //
  // isbn はこのコンポーネントが生きている間は変わらない (URL から来て、
  // 別のノートを開けばページごと作り直される) ので、初期値だけで足りる。
  // defaultValue に対する MemoEditor の前提と同じ
  const [status, setStatus] = useState<BookPrefillStatus>(isbn ? "loading" : "idle");

  // いまの本文を effect から読むための控え。value を effect の依存に入れると
  // 打鍵のたびに取得がやり直しになるため、依存には入れずここで拾う
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

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
          setStatus("notFound");
          return;
        }
        // 取得を待つ間に打ち始めていたら書き換えない。遅れて返ってきた書誌が
        // 手書きを消すのがこの機能で最悪の事故
        if (valueRef.current !== pristine) {
          setStatus("skipped");
          return;
        }
        setMemo(scanRegisterMemo(isbn, book));
        setStatus("loaded");
      })
      .catch((err) => {
        if (abort.signal.aborted) {
          return; // ページを離れただけ
        }
        // 握り潰さずに残す (UI にも status で出る)
        console.warn("書誌の取得に失敗しました", err);
        setStatus("error");
      });
    return () => abort.abort("unmount");
  }, [isbn, setMemo, pristine]);

  return status;
}
