import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import SearchDocsPage from "./page";

test("docs/05-全文検索の使い方.md の内容をレンダリングする", async () => {
  const html = renderToStaticMarkup(await SearchDocsPage());
  expect(html).toContain("全文検索の使い方");
  expect(html).toContain("AND");
  expect(html).toContain("OR");
});
