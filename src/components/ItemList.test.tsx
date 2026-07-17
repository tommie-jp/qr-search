import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Item } from "@/generated/prisma/client";
import type { ViewMode } from "@/lib/viewMode";
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
    deletedAt: null,
    ...overrides,
  };
}

const noop = () => {};

const render = (
  items: Item[],
  query = "",
  registerHref: string | null = null,
  trashedMatches = 0,
  view: ViewMode = "compact",
) =>
  renderToStaticMarkup(
    <ItemList
      items={items}
      query={query}
      page={1}
      sort="updated"
      action={noop}
      view={view}
      viewAction={noop}
      trashAction={noop}
      registerHref={registerHref}
      trashedMatches={trashedMatches}
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

// 0 件でもゴミ箱に同じ条件の一致があれば知らせる (docs/12-ゴミ箱計画.md §5)。
// 消したノートを探して 0 件のときや、ゴミ箱のノートと同じコードを
// 再スキャンして二重登録しかけたときの受け皿
test("0 件 + ゴミ箱に一致があれば案内リンクを出す", () => {
  const html = render([], "9784873115658", null, 2);
  expect(html).toContain("ゴミ箱に 2 件");
  expect(html).toContain('href="/trash"');
});

test("ゴミ箱に一致が無ければ案内を出さない", () => {
  const html = render([], "9784873115658", null, 0);
  expect(html).not.toContain("ゴミ箱");
});

test("ゴミ箱の案内と「新規登録」は共存する (復元か新規かはユーザが選ぶ)", () => {
  // 同じ本の 2 冊目など、新規が正しい場合もあるのでボタンは残す
  const html = render([], "9784873115658", "/edit/4952?code=9784873115658", 1);
  expect(html).toContain("ゴミ箱に 1 件");
  expect(html).toContain("新規登録");
});

// 表示モード (docs/23-検索結果表示モード計画.md)

test("表示モードの切替を出し、いま選ばれている側が判る", () => {
  const html = render([makeItem()], "", null, 0, "compact");
  expect(html).toContain("表示");
  expect(html).toContain('value="compact"');
  expect(html).toContain('value="card"');
  // 押さなくても現在のモードが見える (ドロップダウンにしない理由)
  expect(html).toContain('value="compact" aria-pressed="true"');
});

test("カード表示はカラム数を指定せず画面幅に任せる", () => {
  // スマホ 1 列 / PC 2 列以上は auto-fill が決める。モードでカラム数を
  // 固定すると、狭い画面で 2 列になり何も読めなくなる
  const html = render([makeItem()], "", null, 0, "card");
  expect(html).toContain("auto-fill");
});

test("カードの下限幅は器の幅で頭打ちにする (狭い画面で横スクロールを出さない)", () => {
  // 素の minmax(20rem,1fr) だと、器が 20rem より狭い画面 (実測: 320px 端末で
  // 器は 273px) でも列が 20rem に広がり横スクロールが出た
  const html = render([makeItem()], "", null, 0, "card");
  expect(html).toContain("minmax(min(20rem,100%),1fr)");
});

test("小表示は今までどおりの 1 カラムの一覧 (グリッドにしない)", () => {
  const html = render([makeItem()], "", null, 0, "compact");
  expect(html).toContain("divide-y");
  expect(html).not.toContain("auto-fill");
});

test("0 件の案内はカード表示でも全カラムに渡す", () => {
  const html = render([], "", null, 0, "card");
  expect(html).toContain("該当する部品がありません");
  expect(html).toContain("col-span-full");
});
