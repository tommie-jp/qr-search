import Link from "next/link";
import type { ReactNode } from "react";
import type { Item } from "@/generated/prisma/client";
import { firstImageName, thumbUrl } from "@/lib/memoImages";
import { memoPreview } from "@/lib/memoPreview";
import { memoSummary } from "@/lib/memoSummary";
import { tagSearchHref } from "@/lib/tags";
import { DEFAULT_VIEW_MODE, type ViewMode } from "@/lib/viewMode";

// 画像モードは ImageMasonry が描くのでここには来ない (ItemList が
// compact に畳んでから渡す)。型で 'image' を締め出して前提を保証する
export type RowViewMode = Exclude<ViewMode, "image">;

interface ItemRowProps {
  item: Item;
  // 選択モードで先頭に差し込むチェックボックス (通常時は undefined)。
  checkbox?: ReactNode;
  // 表示モード (docs/23-検索結果表示モード計画.md)。既定は今までの 2 行表示。
  view?: RowViewMode;
}

// サムネの一辺 (px)。行の高さに合わせる: 小は 2 行分、大は 5 行分。
// width/height 属性にも渡して、読み込み前から場所を取らせる (画像が届いた
// 瞬間に行が飛び跳ねないように)。
const THUMB_PX: Record<RowViewMode, number> = { compact: 40, card: 96 };
const THUMB_SIZE_CLASS: Record<RowViewMode, string> = {
  compact: "size-10",
  card: "size-24",
};

// 検索結果 / 一覧の 1 件。
//
//   compact … 1 行目「#番号 タイトル」/ 2 行目タグ + 右端に小さなサムネ。
//   card    … + 本文プレビュー 3 行 + 大きめのサムネ。
//
// タイトル (memoSummary) と本文 (memoPreview) は同じ規則で切り分けてあり、
// 本文には 1 行目・タグ・プロパティ・画像が出てこない。カードの 3 行に
// 「他の場所で既に見えているもの」を流さないため (memoPreview.ts 参照)。
export function ItemRow({
  item,
  checkbox,
  view = DEFAULT_VIEW_MODE,
}: ItemRowProps) {
  const isUrl = item.mode === "url";
  const title = isUrl ? item.url : memoSummary(item.memo);
  // URL モードのノートには本文も貼った画像も無い (memo が空)
  const preview = isUrl ? "" : memoPreview(item.memo);
  const imageName = isUrl ? null : firstImageName(item.memo);

  const thumb = imageName && (
    // next/image は使えない。画像 API はログイン必須で、optimizer が
    // サーバ側から取りに行くときに Cookie/Authorization が付かず 401 になる。
    // 縮小は保存時に済ませてある (src/lib/thumbnail.ts) ので optimizer は不要。
    //
    // alt="" … 装飾。中身はすぐ左のタイトルが説明しており、読み上げに
    // 同じものを 2 度言わせない
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(imageName)}
      alt=""
      width={THUMB_PX[view]}
      height={THUMB_PX[view]}
      loading="lazy"
      decoding="async"
      className={`${THUMB_SIZE_CLASS[view]} shrink-0 self-center rounded bg-gray-100 object-cover`}
    />
  );

  const tags = item.tags.length > 0 && (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      {item.tags.map((tag) => (
        <Link
          key={tag}
          href={tagSearchHref(tag)}
          // relative … タイトルの当たり判定 (STRETCHED_LINK_CLASS) の上に出す。
          // 敷いた膜の下に居ると、タグを押してもノートが開いてしまう
          className="relative z-10 text-sm text-blue-700 hover:underline"
        >
          #{tag}
        </Link>
      ))}
    </div>
  );

  // 枠内のどこを押してもノートが開くようにする。
  //
  // 行全体を <a> で包むことはできない。タグは別の行き先 (タグ検索) を持つので
  // リンクの入れ子になり、HTML として不正で挙動も壊れる。そこでリンクは
  // タイトルの 1 つに保ったまま、その ::after を枠いっぱいに広げて当たり判定
  // だけを大きくする (stretched link)。href は本物のリンクのままなので、
  // 中クリックで新しいタブ・右クリックで URL コピーも今までどおり効く。
  //
  // 上に出したい物 (タグ) は relative z-10 で膜より前に出す。
  //
  // **選択モードでは敷かない。** チェックボックスまで膜が覆って押せなくなる
  // うえ、選んでいる最中に枠へ触れるたびノートへ飛んでしまう
  const stretchedLink = checkbox ? "" : "after:absolute after:inset-0";

  if (view === "card") {
    return (
      // 1 枚ずつが独立したカード。小表示では ul が枠を持ち区切り線で仕切るが、
      // グリッドに並べるときは ul は器でしかないので、枠と地色は各カードが持つ。
      // h-full … グリッドで伸ばされた分を中身にも渡し、隣とサムネの高さを揃える
      <li className="h-full overflow-hidden rounded border border-gray-200 bg-white">
        {/* relative … タイトルの当たり判定を広げる ::after の基準にする */}
        <div className="relative flex h-full gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100">
          {checkbox}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-baseline gap-2">
              <Link
                href={`/item/${item.itemNo}`}
                transitionTypes={["nav-forward"]}
                className="shrink-0 font-mono font-bold"
              >
                #{item.itemNo}
              </Link>
              <Link
                href={`/item/${item.itemNo}`}
                transitionTypes={["nav-forward"]}
                className={`truncate text-gray-600 ${stretchedLink}`}
              >
                {title}
              </Link>
            </div>
            {/* タグが無くても行の高さは取る。隣のカードと本文の始まる位置が
                揃わないと、並べたときに行がガタつく */}
            <div className="mt-0.5 min-h-4">{tags}</div>
            {preview && (
              // 行数は CSS で決める。Markdown 上の 1 行は折り返して 2 行にも
              // なるため、抽出側で数えても画面の行数とは一致しない
              <p className="mt-1 line-clamp-3 text-sm text-gray-500">
                {preview}
              </p>
            )}
          </div>
          {thumb}
        </div>
      </li>
    );
  }

  return (
    <li>
      {/* relative … タイトルの当たり判定を広げる ::after の基準にする */}
      <div className="relative flex items-baseline gap-3 px-4 py-1.5 transition-colors hover:bg-gray-50 active:bg-gray-100">
        {checkbox}
        <Link
          href={`/item/${item.itemNo}`}
          transitionTypes={["nav-forward"]}
          className="shrink-0 font-mono font-bold"
        >
          #{item.itemNo}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/item/${item.itemNo}`}
            transitionTypes={["nav-forward"]}
            className={`block truncate text-gray-600 ${stretchedLink}`}
          >
            {title}
          </Link>
          {tags && <div className="mt-0.5">{tags}</div>}
        </div>
        {thumb}
      </div>
    </li>
  );
}
