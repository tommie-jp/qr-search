import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Item } from "@/generated/prisma/client";
import { ItemRow } from "./ItemRow";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    itemNo: "1",
    itemNoNum: 1,
    memo: "",
    url: "",
    mode: "memo",
    tags: [],
    props: [],
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

const renderRow = (item: Item, checkbox?: React.ReactNode) =>
  renderToStaticMarkup(
    <ul>
      <ItemRow item={item} checkbox={checkbox} />
    </ul>,
  );

test("番号と要約をアイテム詳細へのリンクにする", () => {
  const html = renderRow(
    makeItem({ itemNo: "4951", memo: "BJT NPN 2SC2712-Y LY SMD" }),
  );
  expect(html).toContain('href="/item/4951"');
  expect(html).toContain("#4951");
  expect(html).toContain("BJT NPN 2SC2712-Y LY SMD");
});

test("タグを青いタグ検索リンクとして表示する", () => {
  const html = renderRow(
    makeItem({ itemNo: "4951", memo: "2SC2712 #bjt #npn", tags: ["bjt", "npn"] }),
  );
  expect(html).toContain('href="/?q=%23bjt"');
  expect(html).toContain('href="/?q=%23npn"');
  expect(html).toContain("text-blue-700");
});

test("タグのないアイテムはタグ行を出さない", () => {
  const html = renderRow(makeItem({ itemNo: "100", memo: "メモだけ", tags: [] }));
  expect(html).not.toContain("/?q=%23");
});

test("URL モードのアイテムは URL を表示する", () => {
  const html = renderRow(
    makeItem({ itemNo: "7", mode: "url", url: "https://example.com/x", memo: "" }),
  );
  expect(html).toContain("https://example.com/x");
});

test("checkbox スロットを渡すと行の中に描画する", () => {
  const html = renderRow(
    makeItem({ itemNo: "5" }),
    <input type="checkbox" name="itemNo" value="5" />,
  );
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('value="5"');
});
