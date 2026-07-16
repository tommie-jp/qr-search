import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MemoEditor } from "./MemoEditor";

// CodeMirror 本体 (MemoEditorInner) は ssr: false の dynamic import なので、
// ここでは読み込まれない。MemoEditor が自前で描く hidden input と
// 書誌取得の状況表示だけを見る

const render = (props: Parameters<typeof MemoEditor>[0]) =>
  renderToStaticMarkup(<MemoEditor {...props} />);

test("本文は hidden input に入る (フォームの送信値)", () => {
  const html = render({ defaultValue: "本文" });
  expect(html).toContain('name="memo"');
  expect(html).toContain('value="本文"');
});

test("ISBN を渡すと初手から「取得中」を出す", () => {
  // 実機で数秒かかることがあり、無表示だと取得失敗と見分けられない。
  // effect (取得開始) より前の最初の描画から出す
  const html = render({ defaultValue: "\n\n#9784873115658 #book", isbn: "9784873115658" });
  expect(html).toContain("書籍情報を取得中");
  expect(html).toContain('aria-busy="true"');
});

test("ISBN が無ければ状況表示そのものを出さない", () => {
  // 既存ノートの編集や ISBN 以外のコード。関係のない行を増やさない
  const html = render({ defaultValue: "既存の本文" });
  expect(html).not.toContain("書籍情報");
  expect(html).not.toContain("aria-busy");
});
