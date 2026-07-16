import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { TrashedItem } from "@/lib/items";
import { TrashList } from "./TrashList";

const noop = () => {};

function makeRow(overrides: Partial<TrashedItem> = {}): TrashedItem {
  return {
    itemNo: "1234",
    summary: "2SC1815",
    deletedAt: new Date("2026-07-15T03:04:05Z"),
    ...overrides,
  };
}

const render = (rows: TrashedItem[]) =>
  renderToStaticMarkup(
    <TrashList
      rows={rows}
      restoreAction={noop}
      purgeAction={noop}
      emptyTrashAction={noop}
    />,
  );

test("各ノートの番号・要約・削除日時を出す", () => {
  const html = render([makeRow()]);
  expect(html).toContain("#1234");
  expect(html).toContain("2SC1815");
  // JST 固定・ゼロ埋め (03:04:05 UTC = 12:04:05 JST)
  expect(html).toContain("2026/07/15 12:04:05");
});

test("行ごとに復元と永久削除を出す", () => {
  const html = render([makeRow()]);
  expect(html).toContain("復元");
  expect(html).toContain("永久削除");
  expect(html).toContain('value="1234"');
});

test("ゴミ箱が空なら一覧も「空にする」も出さない", () => {
  const html = render([]);
  expect(html).toContain("ゴミ箱は空です");
  expect(html).not.toContain("永久削除");
  expect(html).not.toContain("空にする");
});

test("1 件以上あれば「ゴミ箱を空にする」を出す", () => {
  const html = render([makeRow(), makeRow({ itemNo: "4951" })]);
  expect(html).toContain("空にする");
});

// 番号が解放されてシールが別の部品を指しうることを知らせる
// (docs/12-ゴミ箱計画.md §4)
test("永久削除で番号が再利用されうる注意を出す", () => {
  const html = render([makeRow()]);
  expect(html).toContain("番号");
  expect(html).toContain("シール");
});

test("ノートへのリンクを張る (中身を確かめてから消せるように)", () => {
  const html = render([makeRow()]);
  expect(html).toContain('href="/item/1234"');
});
