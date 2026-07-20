import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DemoBanner } from "./DemoBanner";

// docs/39-デモ公開計画.md §4。案内は loginHint prop があるときだけ出す
test("loginHint があるとログイン案内を出す", () => {
  const html = renderToStaticMarkup(
    <DemoBanner loginHint="ログイン: demo / secret" />,
  );
  expect(html).toContain("ログイン: demo / secret");
});

test("loginHint が無ければ案内を出さない (注意書きだけ)", () => {
  const html = renderToStaticMarkup(<DemoBanner />);
  expect(html).toContain("デモ環境です");
  expect(html).not.toContain("ログイン:");
});

test("loginHint が null でも案内を出さない", () => {
  const html = renderToStaticMarkup(<DemoBanner loginHint={null} />);
  expect(html).not.toContain("ログイン:");
});
