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
    props: [],
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

const noop = () => {};

const render = (items: Item[], query = "", registerHref: string | null = null) =>
  renderToStaticMarkup(
    <ItemList
      items={items}
      query={query}
      page={1}
      sort="updated"
      action={noop}
      registerHref={registerHref}
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

test("0 件 + 登録リンクありなら「新規登録」を出す", () => {
  // スキャンした未登録コードから新規ノートを作る導線
  // (docs/10-スキャン新規登録計画.md)
  const html = render([], "9784873115658", "/edit/4952?code=9784873115658");
  expect(html).toContain("該当する部品がありません");
  expect(html).toContain('href="/edit/4952?code=9784873115658"');
  // 何が作られるか見せる (押し間違えても更新するまで作成されない)
  expect(html).toContain("#9784873115658");
  expect(html).toContain("新規登録");
});

test("0 件でも登録リンクが無ければ「新規登録」を出さない", () => {
  // タグにできないコード (URL・複数語) はサーバ側で null になる
  const html = render([], "https://example.com/evil", null);
  expect(html).toContain("該当する部品がありません");
  expect(html).not.toContain("新規登録");
});

test("1 件以上あれば「新規登録」を出さない", () => {
  const html = render(
    [makeItem({ itemNo: "4951" })],
    "9784873115658",
    "/edit/4952?code=9784873115658",
  );
  expect(html).not.toContain("新規登録");
});
