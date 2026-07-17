import type { Metadata } from "next";
import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { ACTION_LINK_CLASS } from "@/components/ui";
import { recentLogs } from "@/lib/logBuffer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "サーバログ",
};

// サーバログの表示 (docs/21-ログ表示計画.md)。
// 書影・書誌・商品情報の取得失敗はサーバの警告にしか出ないため、
// スマホからでも原因に届くようにする。ログインは proxy が門番
// (publicPaths に無いパスは既定で閉じる)。
//
// 読み直しはブラウザの再読み込みで足りる (ポーリングはしない。docs/21 §4)。

// サーバの TZ (コンテナは UTC) に依存させず、常に日本時間で出す
const TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const LEVEL_BADGE: Record<string, string> = {
  warn: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};

export default function LogsPage() {
  const logs = recentLogs();

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">サーバログ</h1>
          <Link href="/" transitionTypes={["nav-back"]} className={ACTION_LINK_CLASS}>
            検索へ
          </Link>
        </div>
        <p className="text-sm text-gray-500">
          直近の警告・エラー (新しい順、最大 200 件)。サーバが再起動すると消えます。
        </p>
        {logs.length === 0 ? (
          // 「壊れて出ない」と見分けが付く文言にする (docs/21 §3)
          <p className="text-sm text-gray-500">
            ログはありません (起動後、サーバ側の警告・エラーはまだ発生していません)。
          </p>
        ) : (
          <ul className="space-y-2">
            {logs.map((log, i) => (
              <li
                key={`${log.at}-${i}`}
                className="rounded border border-gray-300 bg-white px-3 py-2"
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className={`rounded px-1.5 py-0.5 font-bold ${LEVEL_BADGE[log.level]}`}
                  >
                    {log.level}
                  </span>
                  <time>{TIME_FORMAT.format(log.at)}</time>
                </div>
                <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                  {log.text}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageTransition>
  );
}
