import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Sort } from "@/lib/validation";
import type { ViewMode } from "@/lib/viewMode";
import { BottomActionBar } from "./BottomActionBar";
import { SelectModeProvider } from "./SelectModeProvider";

const noop = () => {};

const render = (
  view: ViewMode = "compact",
  sort: Sort = "updated",
  query = "",
  isProd = true,
) =>
  renderToStaticMarkup(
    <SelectModeProvider>
      <BottomActionBar
        query={query}
        sort={sort}
        view={view}
        viewAction={noop}
        stickerHost="qr.example.jp"
        isProd={isProd}
      />
    </SelectModeProvider>,
  );

test("5 つの操作をすべて出す", () => {
  const html = render();
  for (const label of ["スキャン", "画像検索", "小", "更新順", "選択"]) {
    expect(html).toContain(label);
  }
});

// 表示・並び順は 2 択なのでトグル 1 個にし、ラベルには**現在の値**を出す
// (docs/31-下部操作バー計画.md §3-4)

test("表示トグルは現在のモードを見せ、送信値はもう一方になる", () => {
  const html = render("compact");
  // いま何が選ばれているかが押さなくても判る
  expect(html).toContain(">小<");
  // 押したら切り替わる先
  expect(html).toContain('value="card"');
  expect(html).not.toContain('value="compact"');
});

test("カード表示のときは逆向きになる", () => {
  const html = render("card");
  expect(html).toContain(">大<");
  expect(html).toContain('value="compact"');
  expect(html).not.toContain('value="card"');
});

test("並び順トグルは現在の順を見せ、リンク先はもう一方になる", () => {
  const html = render("compact", "updated", "npn");
  expect(html).toContain(">更新順<");
  // buildSearchUrl と同じ形。切り替えたら 1 ページ目に戻す
  expect(html).toContain("sort=itemNo");
  expect(html).not.toContain("sort=updated");
});

test("番号順のときは逆向きになる", () => {
  const html = render("compact", "itemNo");
  expect(html).toContain(">番号順<");
  // 戻り先は既定の更新順。buildSearchUrl は既定値を URL から省くので
  // sort= は付かない (検索語も無いので素の "/")
  expect(html).toContain('href="/"');
  expect(html).not.toContain("sort=itemNo");
});

test("並び順の切替は検索語を持ち回す", () => {
  // 並び替えただけで検索語が消えては困る
  const html = render("compact", "updated", "npn");
  expect(html).toContain("q=npn");
});

test("表示の切替は cookie を書くフォーム送信で、JS 無効でも動く", () => {
  const html = render();
  expect(html).toContain("<form");
  expect(html).toContain('type="submit"');
  expect(html).toContain('name="view"');
});

test("初期状態では選択モードに入っていない", () => {
  const html = render();
  expect(html).toContain('aria-pressed="false"');
});

// 非本番はヘッダーと同じくピンクに塗る。色に数日で慣れるとしても、
// 常時見えている帯が「本番ではない」ことに気づく手がかりになる
test("非本番はピンク、本番は白の帯にする", () => {
  expect(render("compact", "updated", "", false)).toContain("bg-pink-100/95");
  expect(render("compact", "updated", "", true)).toContain("bg-white/95");
});

// アイコンの機能色 (docs/31-下部操作バー計画.md §11-1)。
// ここで固定できるのは「5 スロットそれぞれに色が乗っている」ことだけで、
// 選択中に青を外して親の白を継ぐ方 (§11-5) はこのテストでは守れない —
// 常に text-blue-600 を当てるよう直しても非選択時の描画は変わらず、
// これは通ってしまう。選択中の描画は静的描画では作れない
// (この土台に jsdom は無い) ため、反転はブラウザで確認する
// (HeaderMenu.test.tsx と同じ方針)
test("5 スロットのアイコンにそれぞれ機能色が乗る", () => {
  const html = render();
  for (const color of [
    "text-sky-600",
    "text-violet-600",
    "text-emerald-600",
    "text-amber-600",
    "text-blue-600",
  ]) {
    expect(html).toContain(color);
  }
});

test("一覧がバーに隠れないよう余白を確保する", () => {
  // これが無いと一覧の最終行とページ送りがバーの下に潜る
  const html = render();
  expect(html).toContain("env(safe-area-inset-bottom)");
});
