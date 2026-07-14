import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MemoPanel } from "./MemoPanel";

const render = (defaultMode: "markdown" | "text" | "edit") =>
  renderToStaticMarkup(
    <MemoPanel
      defaultMode={defaultMode}
      markdownView={<div>MD_VIEW</div>}
      textView={<div>TEXT_VIEW</div>}
      editForm={<div>EDIT_FORM</div>}
    />,
  );

test("デフォルトモードのパネルだけが表示される", () => {
  const html = render("markdown");
  // 3 パネルとも DOM には存在する (編集中の入力を保持するため hidden で切替)
  expect(html).toContain("MD_VIEW");
  expect(html).toContain("TEXT_VIEW");
  expect(html).toContain("EDIT_FORM");
  // markdown 以外のパネルは hidden
  const hiddenCount = (html.match(/hidden=""/g) ?? []).length;
  expect(hiddenCount).toBe(2);
});

test("切替タブ (markdown / テキスト / 編集) を表示する", () => {
  const html = render("text");
  expect(html).toContain("markdown");
  expect(html).toContain("テキスト");
  expect(html).toContain("編集");
});
