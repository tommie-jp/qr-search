"use client";

import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import type { BookSummary } from "@/lib/book";
import type { ProductSummary } from "@/lib/product";
import { scanRegisterMemo } from "@/lib/scanRegister";

// 事前入力の対象。ISBN なら書誌 (docs/13-書誌自動取得計画.md)、
// JAN なら商品情報 (docs/14-JAN商品情報取得計画.md)。
// 取得の流れは全く同じで、違うのは引く API ルートと文言だけなので、
// フックは 1 本にして種別で分ける。
export type PrefillKind = "book" | "product";

export interface PrefillTarget {
  kind: PrefillKind;
  code: string;
}

const API_PATH: Record<PrefillKind, string> = {
  book: "/api/books",
  product: "/api/products",
};

// デモインスタンスは外部 API のキーを持たないため、取得の口が demoDisabled を
// 返す (docs/39-デモ公開計画.md §5)。通常の失敗 (error) とは分けて、専用の
// 文言を出したいので、独立した例外にして catch で見分ける。
class DemoDisabledError extends Error {}

// 自分のサーバの /api/books/<isbn> か /api/products/<jan> を引く。
// 外部 API を直接叩かない理由は各ルート (route.ts) に書いてある
// (books は NDL の CORS、products はキーの秘匿)。
// 取得ごとの上限もサーバ側が持つ (sourceTimeout.ts)。
async function fetchSummary(
  { kind, code }: PrefillTarget,
  signal: AbortSignal,
): Promise<BookSummary | ProductSummary | null> {
  const res = await fetch(`${API_PATH[kind]}/${encodeURIComponent(code)}`, {
    signal,
  });
  const body = await res.json().catch(() => null);
  // デモは「失敗」ではなく「無効」。専用文言を出すため先に見分ける
  if (body?.demoDisabled) {
    throw new DemoDisabledError();
  }
  if (!res.ok || !body?.success) {
    throw new Error(body?.error ?? `取得に失敗しました (HTTP ${res.status})`);
  }
  return body.data;
}

// 取得の途中経過。文言は呼び出し側 (MemoEditor) が決める。
//   idle     … 取得対象ではない (取得しない)
//   loading  … 取得中
//   loaded   … 取得して本文に入れた
//   skipped  … 取得できたが、打ち始めていたので入れなかった
//   notFound … どの API にも無かった
//   error    … 通信・サーバの失敗
//   demoDisabled … デモインスタンスで取得を無効にしている (docs/39 §5)
export type PrefillStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "skipped"
  | "notFound"
  | "error"
  | "demoDisabled";

interface PrefillOptions {
  // 新規登録するコードが ISBN / JAN のときだけ渡す
  target?: PrefillTarget;
  // いまの本文 (打ち始めたかの判定に使う)
  value: string;
  // 「まだ何も書いていない」ことを表す本文
  pristine: string;
  setMemo: Dispatch<SetStateAction<string>>;
}

// ISBN / JAN をスキャンして開いた新規ノートに、書誌・商品情報を流し込む。
//
// target が undefined のとき (既存ノート・対象外のコード・手打ちの編集) は
// 何もしない。
export function usePrefill({
  target,
  value,
  pristine,
  setMemo,
}: PrefillOptions): PrefillStatus {
  // 最初の描画から「取得中」を出す。effect (取得開始) を待って出すと、
  // 一瞬だけ無表示になるうえ、effect の中で同期に setState することになる。
  //
  // target はこのコンポーネントが生きている間は変わらない (URL から来て、
  // 別のノートを開けばページごと作り直される) ので、初期値だけで足りる。
  // defaultValue に対する MemoEditor の前提と同じ
  const [status, setStatus] = useState<PrefillStatus>(target ? "loading" : "idle");

  // いまの本文を effect から読むための控え。value を effect の依存に入れると
  // 打鍵のたびに取得がやり直しになるため、依存には入れずここで拾う
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // 依存はオブジェクトの identity ではなく中身 (kind / code) で持つ。
  // 親の再描画で毎回新しいオブジェクトが渡されても取得をやり直さない
  const kind = target?.kind;
  const code = target?.code;
  useEffect(() => {
    if (!kind || !code) {
      return;
    }
    const abort = new AbortController();
    fetchSummary({ kind, code }, abort.signal)
      .then((summary) => {
        if (!summary) {
          // どの API にも無かった。事前入力のままにして手で書いてもらう
          // (導線は止めない)
          setStatus("notFound");
          return;
        }
        // 取得を待つ間に打ち始めていたら書き換えない。遅れて返ってきた内容が
        // 手書きを消すのがこの機能で最悪の事故
        if (valueRef.current !== pristine) {
          setStatus("skipped");
          return;
        }
        setMemo(scanRegisterMemo(code, summary));
        setStatus("loaded");
      })
      .catch((err) => {
        if (abort.signal.aborted) {
          return; // ページを離れただけ
        }
        // デモは失敗ではないので、専用の status にして専用文言を出す
        if (err instanceof DemoDisabledError) {
          setStatus("demoDisabled");
          return;
        }
        // 握り潰さずに残す (UI にも status で出る)
        console.warn("書誌・商品情報の取得に失敗しました", err);
        setStatus("error");
      });
    return () => abort.abort("unmount");
  }, [kind, code, setMemo, pristine]);

  return status;
}
