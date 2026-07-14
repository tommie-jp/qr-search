import { expect, test } from "vitest";
import { formatJstDateTime } from "./datetime";

test("年月日時分秒を JST・ゼロ埋めで表示する", () => {
  // 2016-07-07T00:05:03Z は JST で 09:05:03
  const d = new Date("2016-07-07T00:05:03Z");
  expect(formatJstDateTime(d)).toBe("2016/07/07 09:05:03");
});

test("深夜 0 時台は 24 時ではなく 00 時と表示する", () => {
  // 2026-07-14T15:53:16Z は JST で翌日 00:53:16
  const d = new Date("2026-07-14T15:53:16Z");
  expect(formatJstDateTime(d)).toBe("2026/07/15 00:53:16");
});
