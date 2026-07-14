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

test("インライン数式 $...$ を KaTeX でレンダリングする", () => {
  const html = render("質量エネルギーは $E = mc^2$ で表せる");
  expect(html).toContain('class="katex"');
  expect(html).not.toContain("$E = mc^2$");
});

test("ブロック数式 $$...$$ を display モードでレンダリングする", () => {
  const html = render("$$\n\\int_0^1 x^2 dx\n$$");
  expect(html).toContain("katex-display");
});

test("ブロック数式は <pre> に包まれない", () => {
  const html = render("$$\nx + y\n$$");
  expect(html).not.toContain("<pre");
});

test("数式の巨大サイズ指定は maxSize で頭打ちになる", () => {
  const html = render("$\\rule{99999em}{99999em}$");
  expect(html).toContain("height:50em");
  expect(html).not.toContain("height:99999em");
});

test("閉じの $ がない単独の $ はそのまま表示する", () => {
  const html = render("価格は $100 です");
  expect(html).not.toContain("katex");
  expect(html).toContain("$100");
});

test("\\$ でエスケープすると数式扱いしない", () => {
  const html = render("価格は \\$100 と \\$200 です");
  expect(html).not.toContain("katex");
  expect(html).toContain("$100");
});

test("alt 末尾の |数字 を画像の幅として解釈する", () => {
  const html = render("![|200](/api/images/a.png)");
  expect(html).toContain('width="200"');
  expect(html).not.toContain("|200");
});

test("alt 本文と |数字 を併用できる", () => {
  const html = render("![スクショ|200](/api/images/a.png)");
  expect(html).toContain('alt="スクショ"');
  expect(html).toContain('width="200"');
});

test("幅指定なしの画像は alt をそのまま表示し width を付けない", () => {
  const html = render("![スクショ](/api/images/a.png)");
  expect(html).toContain('alt="スクショ"');
  expect(html).not.toContain("width=");
});

test("末尾が数字でない | は幅指定として扱わない", () => {
  const html = render("![a|b](/api/images/a.png)");
  expect(html).toContain('alt="a|b"');
  expect(html).not.toContain("width=");
});
