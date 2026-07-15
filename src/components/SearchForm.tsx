"use client";

import { useEffect, useRef, useState } from "react";
import { BOX_CLASS } from "@/components/ui";
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
}

interface Dropdown {
  ctx: TagContext;
  candidates: string[];
  active: number; // -1 = 未選択 (この間は Enter で検索送信)
}

const MAX_CANDIDATES = 8;

// 検索窓。素の GET フォームのまま、タグ (#…) を打ちかけたときだけ
// 候補ドロップダウンで補完を助ける (JS 無効でも検索自体は動く)。
export function SearchForm({ initialQuery, tags }: SearchFormProps) {
  const [query, setQuery] = useState(initialQuery);
  const [dropdown, setDropdown] = useState<Dropdown | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 補完適用後にキャレット位置を復元するための保留値。
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      const pos = pendingCaret.current;
      inputRef.current.setSelectionRange(pos, pos);
      pendingCaret.current = null;
    }
  });

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

  return (
    <form method="GET" action="/" className="relative flex gap-2">
      <div className="relative w-full">
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) =>
            refresh(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
          }
          onBlur={() => setDropdown(null)}
          placeholder="部品番号・メモ・URL を全文検索（スペースで AND、|で OR、#でタグ）"
          autoComplete="off"
          role="combobox"
          aria-expanded={dropdown !== null}
          aria-autocomplete="list"
          aria-controls="tag-suggestions"
          className={`w-full ${BOX_CLASS}`}
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
                className={`cursor-pointer px-3 py-1.5 text-sm ${
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
      <button
        type="submit"
        className="whitespace-nowrap rounded bg-blue-600 px-4 py-2 font-medium text-white"
      >
        検索
      </button>
    </form>
  );
}
