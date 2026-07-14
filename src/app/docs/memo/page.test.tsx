import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import MemoDocsPage from "./page";

test("docs/メモ記法.md の内容をレンダリングする", async () => {
  const html = renderToStaticMarkup(await MemoDocsPage());
  expect(html).toContain("メモ記法");
  expect(html).toContain("幅指定");
  expect(html).toContain("mermaid");
});

test("mermaid の記法例はコードブロックのまま図にしない", async () => {
  const html = renderToStaticMarkup(await MemoDocsPage());
  expect(html).not.toContain("mermaid-diagram");
});
