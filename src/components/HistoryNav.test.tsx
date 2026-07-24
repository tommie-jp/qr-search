import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { BottomBarProvider } from "./BottomBarContext";
import { HistoryNav, PageBottomBar } from "./HistoryNav";

// PageBottomBar は現在パスで出し分ける。usePathname を差し替えて両分岐を確かめる
const mockPathname = vi.fn(() => "/other");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// このリポジトリのコンポーネントテストは renderToStaticMarkup の静的描画だけで、
// 操作を伴うテストの土台 (jsdom / testing-library) を持たない
// (HeaderMenu.test.tsx と同じ方針)。ここで確かめられるのは初回描画までで、
// Navigation API による活性/非活性の切り替えはブラウザで実物を通して確認する。
const render = () => renderToStaticMarkup(<HistoryNav />);

// PageBottomBar は useBottomBar (Provider 必須) を使うので context で包む
const renderBar = (isProd: boolean) =>
  renderToStaticMarkup(
    <BottomBarProvider>
      <PageBottomBar isProd={isProd} />
    </BottomBarProvider>,
  );

test("戻る・進むの 2 ボタンを描く", () => {
  const html = render();
  expect(html).toContain('aria-label="前の画面に戻る"');
  expect(html).toContain('aria-label="次の画面に進む"');
});

// 初回描画 (サーバ側の想定) では履歴の可否が分からないので両方 disabled。
// クライアントでマウント後に Navigation API で活性化する
// (class に含まれる disabled: バリアントと数え違えないよう属性だけを数える)
test("初回描画では両方 disabled にする", () => {
  const html = render();
  expect(html.match(/disabled=""/g)?.length).toBe(2);
});

// standalone 限定表示だった頃の名残 (hidden / standalone:) が残っていないこと。
// ブラウザでも常時出す回帰チェック
test("常時表示にする (hidden / standalone: を持たない)", () => {
  const html = render();
  expect(html).not.toContain("standalone:");
  expect(html).not.toMatch(/class="[^"]*\bhidden\b/);
});

// PageBottomBar は BottomActionBar を持たないページ用の下部バー。
// ホーム ("/") では BottomActionBar が ← → を持つので二重に出さない。
test("PageBottomBar はホーム以外では ← → を描く", () => {
  mockPathname.mockReturnValue("/item/42");
  const html = renderBar(true);
  expect(html).toContain('aria-label="前の画面に戻る"');
  expect(html).toContain('aria-label="次の画面に進む"');
});

test("PageBottomBar はホーム (/) では何も描かない (二重帯を避ける)", () => {
  mockPathname.mockReturnValue("/");
  const html = renderBar(true);
  expect(html).toBe("");
});

// 非本番は帯もピンクに塗る (ヘッダー・BottomActionBar と揃える)
test("PageBottomBar は非本番でピンク枠にする", () => {
  mockPathname.mockReturnValue("/settings/passkeys");
  const html = renderBar(false);
  expect(html).toContain("border-pink-300");
});
