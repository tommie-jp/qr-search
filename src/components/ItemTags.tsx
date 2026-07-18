import Link from "next/link";
import { tagSearchHref } from "@/lib/tags";

interface ItemTagsProps {
  tags: string[];
  // 省略 = リンクにしない (公開ビュー。docs/22-ノート公開計画.md §4)。
  // タグ検索は未ログインに閉じているので、押すと案内に化けるリンクは出さない
  // (ヘッダの「ログ」を未ログイン時に隠しているのと同じ判断)
  linked?: boolean;
}

const TAG_CLASS = "inline-flex min-h-9 items-center rounded-full px-3";

export function ItemTags({ tags, linked = true }: ItemTagsProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag}>
          {linked ? (
            <Link
              href={tagSearchHref(tag)}
              transitionTypes={["nav-back"]}
              className={`${TAG_CLASS} bg-gray-100 text-blue-700 transition-colors hover:bg-gray-200 active:bg-gray-300`}
            >
              #{tag}
            </Link>
          ) : (
            <span className={`${TAG_CLASS} bg-gray-100 text-gray-600`}>
              #{tag}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
