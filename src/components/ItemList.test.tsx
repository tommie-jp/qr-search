import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Item } from "@/generated/prisma/client";
import { ItemList } from "./ItemList";

// テスト用の Item を作る (省略した項目は既定値で埋める)。
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

const render = (items: Item[]) =>
  renderToStaticMarkup(<ItemList items={items} />);

test("番号と要約をアイテム詳細へのリンクにする", () => {
  const html = render([
    makeItem({ itemNo: "4951", memo: "BJT NPN 2SC2712-Y LY SMD" }),
  ]);
  expect(html).toContain('href="/item/4951"');
  expect(html).toContain("#4951");
  expect(html).toContain("BJT NPN 2SC2712-Y LY SMD");
});

test("タグを青いタグ検索リンクとして表示する", () => {
  const html = render([
    makeItem({ itemNo: "4951", memo: "2SC2712 #bjt #npn", tags: ["bjt", "npn"] }),
  ]);
  // #bjt / #npn がタグ検索 (/?q=%23bjt) へのリンクになっている
  expect(html).toContain('href="/?q=%23bjt"');
  expect(html).toContain('href="/?q=%23npn"');
  expect(html).toContain("#bjt");
  expect(html).toContain("#npn");
  // 青系の色クラスが当たっている
  expect(html).toContain("text-blue-700");
});

test("タグのないアイテムはタグ行を出さない", () => {
  const html = render([makeItem({ itemNo: "100", memo: "メモだけ", tags: [] })]);
  expect(html).not.toContain("/?q=%23");
});

test("URL モードのアイテムは URL を表示する", () => {
  const html = render([
    makeItem({ itemNo: "7", mode: "url", url: "https://example.com/x", memo: "" }),
  ]);
  expect(html).toContain("https://example.com/x");
});

test("0 件のときは該当なしメッセージを出す", () => {
  const html = render([]);
  expect(html).toContain("該当する部品がありません");
});
