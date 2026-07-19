"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  GridViewIcon,
  ImageSearchIcon,
  ListViewIcon,
  ScanIcon,
  SelectIcon,
  SortIcon,
} from "@/components/MenuIcons";
import { PendingLink } from "@/components/PendingLink";
import { useSelectMode } from "@/components/SelectModeProvider";
import {
  BOTTOM_BAR_CLASS,
  BOTTOM_BAR_INNER_CLASS,
  BOTTOM_BAR_SLOT_CLASS,
  BOTTOM_BAR_SPACER_CLASS,
} from "@/components/ui";
import { buildSearchUrl } from "@/lib/searchUrl";
import type { Sort } from "@/lib/validation";
import { VIEW_MODE_COOKIE, type ViewMode } from "@/lib/viewMode";

// cookie を書くサーバーアクション。db.ts を巻き込まないよう prop で受ける
// (ItemList / ViewModeToggle と同じ理由)
type ViewModeAction = (formData: FormData) => void | Promise<void>;

interface BottomActionBarProps {
  query: string;
  sort: Sort;
  view: ViewMode;
  viewAction: ViewModeAction;
  // QR シールに焼かれているホスト。ScannerModal へ渡す
  stickerHost: string;
  // 非本番はヘッダーと同じくピンクに塗る。process.env はクライアントに
  // 渡らないのでサーバから降ろす (layout.tsx と同じ判断)
  isProd: boolean;
}

// スキャナ・画像検索はカメラと重いエンジン (wasm 約 1MB / 埋め込みモデル数十MB)
// を抱えるので、ボタンを押すまで一切読み込まない
// (docs/09-スキャン計画.md §2、docs/25-画像検索計画.md)。
// 以前は SearchForm が持っていたが、ボタンがこのバーへ移ったので所有権も移す。
// ssr: false … camera / document を触るのでサーバでは描画できない
const ScannerModal = dynamic(
  () => import("@/components/ScannerModal").then((m) => m.ScannerModal),
  { ssr: false },
);

const ImageSearchModal = dynamic(
  () => import("@/components/ImageSearchModal").then((m) => m.ImageSearchModal),
  { ssr: false },
);

// 検索画面の主要操作を画面下端にまとめた固定バー (docs/31-下部操作バー計画.md)。
//
// 片手持ちの親指が届くのは画面の下側で、届きにくいのは左右ではなく高さ
// (docs/11-アプリ的UIUX計画.md §8-4 でハンバーガーメニューをボトムシートに
// したのと同じ理由)。散っていた 3 行 (検索窓の行・件数の行・一覧の直上) を
// 1 本に集約し、空いた縦幅を一覧の件数に回す。
//
// 5 スロットはアイコン + 小ラベルの等幅。テキストボタンのまま並べると
// 実測で 450px 必要になり 320px にも 375px にも入らない (docs/31 §3-1)。
export function BottomActionBar({
  query,
  sort,
  view,
  viewAction,
  stickerHost,
  isProd,
}: BottomActionBarProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isImageSearching, setIsImageSearching] = useState(false);
  const { selectMode, enter, exit } = useSelectMode();

  // 表示・並び順はどちらも 2 択なので、セグメントではなく 1 スロットの
  // トグルにする。ラベルには**現在の値**を出す — ViewModeToggle が
  // セグメントを選んだ理由 (いま何が選ばれているか常に見える) は、
  // 現在値をラベルに出すことで保たれる (docs/31 §3-4)
  const isCard = view === "card";
  const nextView: ViewMode = isCard ? "compact" : "card";
  const isItemNoSort = sort === "itemNo";
  const nextSort: Sort = isItemNoSort ? "updated" : "itemNo";

  return (
    <>
      {/* バーぶんの余白。これがないと一覧の最終行とページ送りがバーに隠れる */}
      <div aria-hidden className={BOTTOM_BAR_SPACER_CLASS} />

      <nav
        aria-label="操作"
        className={`${BOTTOM_BAR_CLASS} ${
          isProd ? "border-gray-200 bg-white/95" : "border-pink-300 bg-pink-100/95"
        }`}
      >
        <div className={BOTTOM_BAR_INNER_CLASS}>
          {/* カメラ非対応の環境でも隠さない。押したとき理由を出す方が
              原因を追える (docs/09-スキャン計画.md §6) */}
          <button
            type="button"
            onClick={() => setIsScanning(true)}
            className={`${BOTTOM_BAR_SLOT_CLASS} text-gray-700`}
          >
            <ScanIcon />
            スキャン
          </button>

          {/* 部品を映して登録済みの写真と照合する (docs/25-画像検索計画.md) */}
          <button
            type="button"
            onClick={() => setIsImageSearching(true)}
            className={`${BOTTOM_BAR_SLOT_CLASS} text-gray-700`}
          >
            <ImageSearchIcon />
            画像検索
          </button>

          {/* 表示モード。cookie を書くフォーム送信なのでクライアント JS は
              要らない (JS 無効でも切り替わる)。value は**もう一方のモード** */}
          <form action={viewAction} className="flex flex-1">
            <button
              type="submit"
              name={VIEW_MODE_COOKIE}
              value={nextView}
              aria-label={`表示: ${isCard ? "大" : "小"} (押すと${
                isCard ? "小" : "大"
              }に切替)`}
              className={`${BOTTOM_BAR_SLOT_CLASS} text-gray-700`}
            >
              {isCard ? <GridViewIcon /> : <ListViewIcon />}
              {isCard ? "大" : "小"}
            </button>
          </form>

          {/* 並び順。searchParams を変えるだけのリンクなので JS 無効でも動く。
              同じルート内の遷移では loading.tsx が出ないため PendingLink で
              スピナーを出す (docs/11-アプリ的UIUX計画.md §1-2) */}
          <PendingLink
            href={buildSearchUrl(query, 1, nextSort)}
            aria-label={`並び順: ${isItemNoSort ? "番号順" : "更新順"} (押すと${
              isItemNoSort ? "更新順" : "番号順"
            }に切替)`}
            className={`${BOTTOM_BAR_SLOT_CLASS} text-gray-700`}
          >
            <SortIcon />
            {isItemNoSort ? "番号順" : "更新順"}
          </PendingLink>

          {/* 一括タグ付け・ゴミ箱行きのための選択モード。一覧側 (ItemList) と
              状態を共有するので context 経由で切り替える */}
          <button
            type="button"
            onClick={selectMode ? exit : enter}
            aria-pressed={selectMode}
            className={`${BOTTOM_BAR_SLOT_CLASS} ${
              selectMode ? "bg-blue-600 text-white" : "text-gray-700"
            }`}
          >
            <SelectIcon />
            選択
          </button>
        </div>
      </nav>

      {/* モーダルは **nav の外** に置く。nav は backdrop-blur を持ち、
          backdrop-filter のある要素は position:fixed の包含ブロックになるため、
          中に入れると inset-0 が「バーの矩形」を指して画面全体に広がらない
          (HeaderMenu が覆いとシートを portal している理由と同じ) */}
      {isScanning && (
        <ScannerModal
          stickerHost={stickerHost}
          onClose={() => setIsScanning(false)}
        />
      )}
      {isImageSearching && (
        <ImageSearchModal onClose={() => setIsImageSearching(false)} />
      )}
    </>
  );
}
