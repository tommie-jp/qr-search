import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Item } from "@/generated/prisma/client";
import { BulkTagToolbar } from "./BulkTagToolbar";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    itemNo: "1",
    itemNoNum: 1,
    memo: "",
    url: "",
    mode: "memo",
    tags: [],
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

const noop = () => {};

const render = (items: Item[], selected: Set<string>) =>
  renderToStaticMarkup(
    <BulkTagToolbar
      items={items}
      selected={selected}
      onSelectAll={noop}
      onClear={noop}
      onCancel={noop}
    />,
  );

test("選択件数を表示する", () => {
  const html = render([makeItem({ itemNo: "1" })], new Set(["1"]));
  expect(html).toContain("1 件を選択中");
});

test("追加入力欄と追加ボタンを出す", () => {
  const html = render([makeItem({ itemNo: "1" })], new Set(["1"]));
  expect(html).toContain('name="addTags"');
  expect(html).toContain("追加");
});

test("選択アイテムのタグを削除チップ (removeTag 送信ボタン) にする", () => {
  const items = [makeItem({ itemNo: "1", tags: ["bjt", "npn"] })];
  const html = render(items, new Set(["1"]));
  expect(html).toContain('name="removeTag"');
  expect(html).toContain('value="bjt"');
  expect(html).toContain('value="npn"');
});

test("未選択なら削除チップを出さず、追加を無効化する", () => {
  const html = render([makeItem({ itemNo: "1", tags: ["bjt"] })], new Set());
  expect(html).not.toContain('name="removeTag"');
  expect(html).toContain("disabled");
});
