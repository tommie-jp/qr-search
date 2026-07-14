// タイムスタンプ表示は JST 固定・ゼロ埋め (例: 2016/07/07 09:05:03)。
// サーバの TZ / ロケール既定に依存しないよう明示する。
// hourCycle: "h23" で深夜 0 時台を 24 時ではなく 00 時にする
const JST_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

export function formatJstDateTime(date: Date): string {
  return date.toLocaleString("ja-JP", JST_FORMAT);
}
