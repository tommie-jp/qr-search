"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";
import { fetchBook } from "@/lib/openbd";
import { scanRegisterMemo } from "@/lib/scanRegister";

// スマホの電波が悪いときに待ち続けないための上限。ここで諦めても
// 「事前入力のまま手で書く」= 今までの動作に戻るだけなので、短くてよい
const FETCH_TIMEOUT_MS = 5000;

// ISBN をスキャンして開いた新規ノートに、openBD の書誌を流し込む
// (設計は docs/13-書誌自動取得計画.md)。
//
// fetch は**この端末 (スマホ) から直接** openBD を叩く。Next.js の作法である
// Server Components / use API に載せるとサーバ経由になってしまうため、
// あえてクライアントの useEffect で引く。SWR 等を足すほどの規模でもない。
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
    const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
    fetchBook(isbn, abort.signal)
      .then((book) => {
        if (!book) {
          // openBD は版元ドットコム系が中心で収録漏れが実際にある。
          // 事前入力のままにして手で書いてもらう (導線は止めない)
          return;
        }
        // 取得を待つ間に打ち始めていたら書き換えない。遅れて返ってきた書誌が
        // 手書きを消すのがこの機能の最悪の事故なので、prev を見て判断する
        setMemo((prev) => (prev === pristine ? scanRegisterMemo(isbn, book) : prev));
      })
      .catch((err) => {
        if (abort.signal.reason === "unmount") {
          return; // ページを離れただけ
        }
        // 握り潰さずに残す。UI には出さない (書誌が載らないことで分かるし、
        // 出しても手で書く以外にできることがない)
        console.warn("openBD から書誌を取得できませんでした", err);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      abort.abort("unmount");
    };
  }, [isbn, setMemo, pristine]);
}
