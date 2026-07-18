import type { ViewMode } from "@/lib/viewMode";
import { VIEW_MODE_COOKIE } from "@/lib/viewMode";

// setViewModeAction をそのまま import すると db.ts (DATABASE_URL 必須) まで
// 巻き込みテストが動かないため、サーバーアクションは prop で受け取る
// (ItemList の bulkTagAction と同じ理由)。
type ViewModeAction = (formData: FormData) => void | Promise<void>;

interface ViewModeToggleProps {
  view: ViewMode;
  action: ViewModeAction;
}

const OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "compact", label: "小" },
  { mode: "card", label: "大" },
];

// 検索結果の表示モード切替 (docs/23-検索結果表示モード計画.md §5)。
//
// ドロップダウンではなくセグメント切替にしている。選択肢が 2 つしかないので、
// 開いて選ぶ 2 手より 1 タップで替わるほうが早く、いま何が選ばれているかも
// 常に見えている (並び替えの「番号順 / 更新順」と同じ佇まい)。
//
// フォーム送信なのでクライアント JS は要らない。押すと cookie が書き換わり、
// 同じページがサーバで描き直される。
export function ViewModeToggle({ view, action }: ViewModeToggleProps) {
  return (
    <form
      action={action}
      className="flex items-center gap-1"
      aria-label="表示"
    >
      <span className="text-gray-500">表示</span>
      <span className="inline-flex overflow-hidden rounded border border-gray-300">
        {OPTIONS.map(({ mode, label }) => {
          const current = mode === view;
          return (
            <button
              key={mode}
              type="submit"
              name={VIEW_MODE_COOKIE}
              value={mode}
              // 選択中の側も押せるままにしておく (disabled にしない)。
              // 別端末や cookie 切れで表示が既定に戻ったとき、押して直せる
              aria-pressed={current}
              className={`min-h-11 px-3 transition-colors ${
                current
                  ? "bg-blue-600 font-bold text-white"
                  : "bg-white text-blue-600 active:bg-blue-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </span>
    </form>
  );
}
