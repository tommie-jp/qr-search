import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RowThumb } from "./RowThumb";

const IMAGE = "0421547b-ee29-4613-a6d4-da0f41f94054.jpg";
const VIDEO = "2232f915-45fe-4121-836f-0fa6bbd9c4dc.mp4";

function render(name: string, isVideo: boolean): string {
  return renderToStaticMarkup(
    <RowThumb name={name} isVideo={isVideo} sizePx={40} sizeClass="size-10" />,
  );
}

// 再生バッジの三角形 (PlayBadge)。動画のときだけ出る目印
const PLAY_BADGE_PATH = "M9 7.5v9l7-4.5z";

test("画像は ?thumb=1 の縮小版を出し、再生バッジは付けない", () => {
  const html = render(IMAGE, false);
  expect(html).toContain(`src="/api/images/${IMAGE}?thumb=1&amp;v=`);
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('alt=""');
  expect(html).not.toContain(PLAY_BADGE_PATH);
});

test("動画は poster (?thumb=1) を出し、再生バッジを重ねる", () => {
  const html = render(VIDEO, true);
  // 動画も同じ ?thumb=1 経路で poster (thumb カラム) を配る
  expect(html).toContain(`src="/api/images/${VIDEO}?thumb=1&amp;v=`);
  // ▶ バッジで動画だと判る
  expect(html).toContain(PLAY_BADGE_PATH);
});

test("大きさ (width/height + サイズクラス) を渡す", () => {
  const html = render(IMAGE, false);
  expect(html).toContain('width="40"');
  expect(html).toContain("size-10");
});
