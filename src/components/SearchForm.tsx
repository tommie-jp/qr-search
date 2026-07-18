"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { PendingLink } from "@/components/PendingLink";
import { useSearchNav } from "@/components/SearchNav";
import {
  BOX_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "@/components/ui";
import {
  applyCompletion,
  longestCommonPrefix,
  matchTags,
  tagContextAtCursor,
  type TagContext,
} from "@/lib/tagComplete";

interface SearchFormProps {
  initialQuery: string;
  tags: string[];
  // QR シールに焼かれている URL のホスト (QR_BASE_URL 由来)。
  // process.env はクライアントに渡らないのでサーバから降ろす
  stickerHost: string;
}

interface Dropdown {
  ctx: TagContext;
  candidates: string[];
  active: number; // -1 = 未選択 (この間は Enter で検索送信)
}

const MAX_CANDIDATES = 8;

// 打ち終わりを待つ間隔。短すぎると 1 文字ごとに DB を引き、長いと反応が鈍い
const SEARCH_DEBOUNCE_MS = 300;

// スキャナはカメラと読み取りエンジン (wasm 約 1MB) を抱えるので、
// ボタンを押すまで一切読み込まない (docs/09-スキャン計画.md §2)。
// ssr: false … camera / document を触るのでサーバでは描画できない
const ScannerModal = dynamic(
  () => import("@/components/ScannerModal").then((m) => m.ScannerModal),
  { ssr: false },
);

// 画像検索は埋め込みモデル (transformers.js + 数十MB) と Worker を抱えるので、
// スキャナと同じくボタンを押すまで読み込まない (docs/25-画像検索計画.md)。
const ImageSearchModal = dynamic(
  () => import("@/components/ImageSearchModal").then((m) => m.ImageSearchModal),
  { ssr: false },
);

// 検索窓。素の GET フォームのまま、タグ (#…) を打ちかけたときだけ
// 候補ドロップダウンで補完を助ける (JS 無効でも検索自体は動く)。
export function SearchForm({ initialQuery, tags, stickerHost }: SearchFormProps) {
  const { navigate } = useSearchNav();
  const [query, setQuery] = useState(initialQuery);
  const [dropdown, setDropdown] = useState<Dropdown | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isImageSearching, setIsImageSearching] = useState(false);
  // 入力中かどうか (URL の反映を止める判断に使う)
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 補完適用後にキャレット位置を復元するための保留値。
  const pendingCaret = useRef<number | null>(null);
  // 打ち終わり待ちのタイマーと、IME で変換中かどうか。
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposing = useRef(false);

  useEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      const pos = pendingCaret.current;
      inputRef.current.setSelectionRange(pos, pos);
      pendingCaret.current = null;
    }
  });

  useEffect(() => {
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, []);

  // URL の検索語が外から変わったら窓も合わせる (スキャン・タグリンク・戻る)。
  // 入力中 (窓にフォーカスがある) は反映しない: 自分が投げた検索の結果が返る頃には
  // 続きを打っていることがあり、URL で上書きすると打った文字が消えるため。
  // フォーカスがなければ URL が正で、打ち終わった後は最後の応答に必ず追いつく
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  if (initialQuery !== syncedQuery) {
    setSyncedQuery(initialQuery);
    if (!isFocused) {
      setQuery(initialQuery);
      setDropdown(null);
    }
  }

  // 打ち終わったら検索する。打ち直すたびに前の予約は捨てる
  const scheduleSearch = (value: string) => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }
    searchTimer.current = setTimeout(() => navigate(value), SEARCH_DEBOUNCE_MS);
  };

  const searchNow = (value: string) => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    navigate(value);
  };

  // 現在の値とキャレット位置からタグ文脈と候補を計算する。
  const refresh = (value: string, caret: number) => {
    const ctx = tagContextAtCursor(value, caret);
    if (!ctx) {
      setDropdown(null);
      return;
    }
    const candidates = matchTags(ctx.prefix, tags, MAX_CANDIDATES);
    setDropdown(candidates.length > 0 ? { ctx, candidates, active: -1 } : null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    refresh(value, e.target.selectionStart ?? value.length);
    // IME の変換中は検索しない。確定前の文字で引いても意味がなく、
    // 変換候補を選ぶたびにサーバへ行くことになる (compositionend で拾う)
    if (!isComposing.current) {
      scheduleSearch(value);
    }
  };

  // 補完を確定して入力へ反映する。
  const accept = (tagName: string, ctx: TagContext) => {
    const { query: next, cursor } = applyCompletion(query, ctx, tagName, {
      addSpace: true,
    });
    setQuery(next);
    pendingCaret.current = cursor;
    setDropdown(null);
    inputRef.current?.focus();
    // タグを選ぶのは検索の意思表示なので待たずに引く
    searchNow(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中 (日本語入力) のキーは補完に横取りしない。
    if (e.nativeEvent.isComposing) return;
    if (!dropdown) return;
    const { ctx, candidates, active } = dropdown;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setDropdown({ ...dropdown, active: (active + 1) % candidates.length });
        break;
      case "ArrowUp":
        e.preventDefault();
        setDropdown({
          ...dropdown,
          active: active <= 0 ? candidates.length - 1 : active - 1,
        });
        break;
      case "Enter":
        // 候補を選択中のときだけ補完。未選択なら送信を妨げない。
        if (active >= 0) {
          e.preventDefault();
          accept(candidates[active], ctx);
        }
        break;
      case "Tab": {
        // bash 流: 一意なら確定、複数なら最長共通プレフィックスまで伸ばす。
        e.preventDefault();
        if (candidates.length === 1) {
          accept(candidates[0], ctx);
          break;
        }
        const lcp = longestCommonPrefix(candidates);
        if (lcp.length > ctx.prefix.length) {
          const { query: next, cursor } = applyCompletion(query, ctx, lcp);
          setQuery(next);
          pendingCaret.current = cursor;
          refresh(next, cursor);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        setDropdown(null);
        break;
    }
  };

  // JS が動くならクライアント遷移で結果だけ差し替える (全体の再読込を避ける)。
  // JS 無効なら preventDefault が走らず、素の GET フォームとして今までどおり動く
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    searchNow(query);
    // モバイルでキーボードを閉じて結果を見せる
    inputRef.current?.blur();
  };

  return (
    // ボタンが 4 つに増えて (スキャン・画像検索・検索・+)、狭い画面では
    // 一列に収まらなくなった。flex-wrap + 入力窓の min-w で「入りきらなければ
    // ボタン列を次の行へ送る」ようにする。折り返さないままだと入力窓が
    // 潰されて (375px で実測 26px)、横スクロールまで出る
    <form
      method="GET"
      action="/"
      onSubmit={handleSubmit}
      className="relative flex flex-wrap items-start gap-2"
    >
      <div className="relative min-w-40 flex-1">
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposing.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposing.current = false;
            scheduleSearch(e.currentTarget.value);
          }}
          onClick={(e) =>
            refresh(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
          }
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            setDropdown(null);
          }}
          placeholder="部品番号・メモ・URL を全文検索（スペースで AND、|で OR、#でタグ）"
          autoComplete="off"
          role="combobox"
          aria-expanded={dropdown !== null}
          aria-autocomplete="list"
          aria-controls="tag-suggestions"
          className={`min-h-11 w-full ${BOX_CLASS}`}
        />
        {dropdown && (
          <ul
            id="tag-suggestions"
            role="listbox"
            className="absolute left-0 top-full z-10 mt-1 w-full max-w-xs overflow-hidden rounded border border-gray-300 bg-white shadow-lg"
          >
            {dropdown.candidates.map((tag, i) => (
              <li
                key={tag}
                role="option"
                aria-selected={i === dropdown.active}
                // blur より先に確定するため mousedown で拾う。
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(tag, dropdown.ctx);
                }}
                className={`flex min-h-10 cursor-pointer items-center px-3 text-sm ${
                  i === dropdown.active
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                #{tag}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* ボタンは 1 つの塊にまとめる。塊にしないと狭い画面で
          「スキャンだけ入力窓と同じ行に残る」散らかった並びになる。
          塊の中でも折り返すのは、320px ではボタン 4 つが一列に収まらず、
          折り返せないと横スクロールが出るため (実測 53px はみ出す) */}
      <div className="flex flex-wrap gap-2">
        {/* カメラ非対応の環境でも隠さない。押したとき理由を出す方が原因を追える
            (docs/09-スキャン計画.md §6) */}
        <button
          type="button"
          onClick={() => setIsScanning(true)}
          className={`whitespace-nowrap ${SECONDARY_BUTTON_CLASS}`}
        >
          スキャン
        </button>
        {/* 部品を映して登録済みの写真と照合する (docs/25-画像検索計画.md) */}
        <button
          type="button"
          onClick={() => setIsImageSearching(true)}
          className={`whitespace-nowrap ${SECONDARY_BUTTON_CLASS}`}
        >
          画像検索
        </button>
        {/* 打つそばから検索するので普段は押さなくてよいが、JS 無効時の唯一の
            検索手段であり、確定の合図としても残す */}
        <button type="submit" className={`whitespace-nowrap ${PRIMARY_BUTTON_CLASS} px-4`}>
          検索
        </button>
        {/* 空ノートを作る (docs/27-新規ノート追加計画.md)。
            遷移先の /new は押した瞬間に採番して /edit/<番号> へ送るので、
            prefetch は切る。切らないと画面に入っただけで採番クエリが飛び、
            先読みした古い番号へ飛んでしまう (App Router の prefetch={false} は
            hover でも発火しない)。
            /new は force-dynamic で loading.tsx を持たない = 押してから画面が
            変わるまで何も起きないので、素の Link ではなく PendingLink で
            スピナーを出す (docs/11-アプリ的UIUX計画.md §1-2)。
            ラベルが「+」だけなのは幅を詰めるため。意味は aria-label / title で補う */}
        <PendingLink
          href="/new"
          prefetch={false}
          aria-label="新規ノート"
          title="新規ノート"
          transitionTypes={["nav-forward"]}
          className={`text-xl ${SECONDARY_BUTTON_CLASS}`}
        >
          +
        </PendingLink>
      </div>
      {isScanning && (
        <ScannerModal
          stickerHost={stickerHost}
          onClose={() => setIsScanning(false)}
        />
      )}
      {isImageSearching && (
        <ImageSearchModal onClose={() => setIsImageSearching(false)} />
      )}
    </form>
  );
}
