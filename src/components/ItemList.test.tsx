import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Item } from "@/generated/prisma/client";
import { ItemList } from "./ItemList";

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

const render = (items: Item[]) =>
  renderToStaticMarkup(
    <ItemList
      items={items}
      query=""
      page={1}
      sort="updated"
      action={noop}
    />,
  );

test("各アイテムを行として描画する", () => {
  const html = render([
    makeItem({ itemNo: "4951", memo: "BJT NPN" }),
    makeItem({ itemNo: "4502", memo: "BFP420" }),
  ]);
  expect(html).toContain('href="/item/4951"');
  expect(html).toContain('href="/item/4502"');
});

test("初期表示は選択トグルを出し、ツールバー/チェックボックスは出さない", () => {
  const html = render([makeItem({ itemNo: "4951" })]);
  expect(html).toContain("選択");
  // 選択モードに入るまではツールバーもチェックボックスも無い
  expect(html).not.toContain("件を選択中");
  expect(html).not.toContain('type="checkbox"');
});

test("0 件のときは該当なしメッセージを出す", () => {
  const html = render([]);
  expect(html).toContain("該当する部品がありません");
});
