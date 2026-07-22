import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import AboutPage from "./page";

// クレジットページ (docs/46-クレジット表記計画.md)。
// Server Component だが JSX を返すだけ (DB も session も触らない) なので、
// そのまま静的レンダリングして中身を見る

const html = () => renderToStaticMarkup(<AboutPage />);

// docs/46 §1-1。Yahoo! は規定 HTML の改変が禁止。リンク先・文言が一字一句
// 規定どおりに出ることを固定する (誰かが CSS で触ったり文言を変えたら落とす)
test("Yahoo! の規定クレジットを改変せず含む", () => {
  const out = html();
  expect(out).toContain(
    '<a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a>',
  );
});

test("楽天・openBD・NDL の帰属も出す", () => {
  const out = html();
  expect(out).toContain("Supported by Rakuten Developers");
  expect(out).toContain("https://webservice.rakuten.co.jp/");
  expect(out).toContain("https://openbd.jp/");
  expect(out).toContain("https://ndlsearch.ndl.go.jp/");
});

// docs/46 §3-1。設定系と違いログイン・デモに依らず出す。
// ここでは「requireUser や notFound を呼ばずに素で描ける」ことを担保する
// (それらを呼んでいれば、このプレーンなレンダリングが投げる)
test("ログイン状態に依らず素で描ける (見出しが出る)", () => {
  expect(html()).toContain("クレジット");
});
