import Link from "next/link";
import type { Item } from "@/generated/prisma/client";
import { allImageNames, thumbUrl } from "@/lib/memoImages";

// 画像表示モード (docs/32-画像表示モード計画.md)。ページ内のノート本文に
// 貼られた自前画像だけを masonry で敷き詰め、写真からノートを探す入口にする。
//
// タイルは「画像 1 枚 = 1 リンク」でノート単位ではない。1 ノートに複数枚
// あれば全部並び、画像の無いノートはタイルにならない。ItemRow の
// stretched link / タグリンク共存の仕掛けはここでは一切不要なので、
// ItemRow を拡張せず独立したコンポーネントにした。
interface ImageMasonryProps {
  items: Item[];
}

export function ImageMasonry({ items }: ImageMasonryProps) {
  // URL モードのノートは memo が空なので allImageNames("") === [] となり
  // 自然に落ちる (ItemRow のような isUrl 分岐は要らない)
  const tiles = items.flatMap((item) =>
    allImageNames(item.memo).map((name) => ({ item, name })),
  );

  if (tiles.length === 0) {
    // 検索には当たったが、このページの 20 件に画像持ちが無い。
    // ページ割りはノート単位のまま (docs/32 §4) なので起こり得る
    return (
      <p className="rounded border border-gray-200 bg-white px-4 py-6 text-center text-gray-500">
        このページには画像がありません
      </p>
    );
  }

  return (
    // masonry は CSS multi-column で組む (docs/32 §1)。列数は指定せず、
    // 列幅 10rem を基準に画面が決める — card グリッドの auto-fill と同じ思想。
    // 10rem はサムネ (長辺 320px, thumbnail.ts) が 2x DPR でほぼ等倍になる幅
    <ul className="columns-[10rem] gap-2">
      {tiles.map(({ item, name }) => (
        // name はノート内では重複除去済みだが、別ノートが同じ画像を参照
        // できるので itemNo と組で一意にする
        <li
          key={`${item.itemNo}:${name}`}
          className="relative mb-2 break-inside-avoid overflow-hidden rounded"
        >
          <Link href={`/item/${item.itemNo}`} transitionTypes={["nav-forward"]}>
            {/* next/image は使えない (ItemRow と同じ 401 問題)。
                寸法は DB に無いので width/height は出せず、読み込みで高さが
                決まる。地色で場所の気配だけ出す (docs/32 §2)。
                alt … タイル単体がリンクの中身なので ItemRow と違い空にしない */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(name)}
              alt={`#${item.itemNo} の画像`}
              loading="lazy"
              decoding="async"
              className="w-full bg-gray-100"
            />
            {/* 同じノートの画像が並ぶと行き先が見分けられないので、
                押す前に判るよう番号を焼き込む */}
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 font-mono text-xs text-white">
              #{item.itemNo}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
