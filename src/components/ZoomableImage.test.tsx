import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MarkdownView } from "./MarkdownView";
import { ZoomableImage } from "./ZoomableImage";

test("画像をクリック拡大用の button でラップする", () => {
  const html = renderToStaticMarkup(
    <ZoomableImage src="/api/images/a.png" alt="スクショ" width={200} />,
  );
  expect(html).toContain('<button type="button"');
  expect(html).toContain("cursor-zoom-in");
  expect(html).toContain('src="/api/images/a.png"');
  expect(html).toContain('alt="スクショ"');
  expect(html).toContain('width="200"');
});

test("初期状態では拡大オーバーレイを表示しない", () => {
  const html = renderToStaticMarkup(<ZoomableImage src="/api/images/a.png" />);
  expect(html).not.toContain("fixed inset-0");
});

test("MarkdownView の画像はクリック拡大に対応する", () => {
  const html = renderToStaticMarkup(
    <MarkdownView markdown="![スクショ|200](/api/images/a.png)" />,
  );
  expect(html).toContain("cursor-zoom-in");
  expect(html).toContain('width="200"');
  expect(html).toContain('alt="スクショ"');
});
