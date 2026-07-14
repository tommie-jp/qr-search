import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MarkdownView } from "./MarkdownView";

const render = (markdown: string) =>
  renderToStaticMarkup(<MarkdownView markdown={markdown} />);

test("見出し・リストを HTML にレンダリングする", () => {
  const html = render("# タイトル\n\n- 項目1\n- 項目2");
  expect(html).toContain("<h1>タイトル</h1>");
  expect(html).toContain("<li>項目1</li>");
});

test("裸の URL を自動リンクにする (GFM)", () => {
  const html = render("詳しくは https://example.com/x を参照");
  expect(html).toContain('href="https://example.com/x"');
});

test("単一改行を改行として表示する (breaks)", () => {
  const html = render("5V - 3A\n9V - 3A");
  expect(html).toContain("<br/>");
});

test("mermaid フェンスはコードブロックではなく図として扱う", () => {
  const html = render("```mermaid\ngraph TD; A-->B;\n```");
  expect(html).toContain("mermaid-diagram");
  expect(html).not.toContain("<code");
});

test("mermaid 以外のコードフェンスはコードブロックのまま", () => {
  const html = render("```bash\nls -la\n```");
  expect(html).toContain("<code");
  expect(html).not.toContain("mermaid-diagram");
});

test("hast の node prop を DOM に漏らさない", () => {
  const html = render("[link](https://example.com)\n\n```bash\nls\n```");
  expect(html).not.toContain("node=");
});

test("生の HTML (script) は出力しない", () => {
  const html = render('<script>alert("x")</script>ほげ');
  expect(html).not.toContain("<script");
});
