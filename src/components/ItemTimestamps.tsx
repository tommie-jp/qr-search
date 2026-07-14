const TIME_FORMAT: Intl.DateTimeFormatOptions = { timeZone: "Asia/Tokyo" };

interface ItemTimestampsProps {
  item: { createdAt: Date; updatedAt: Date } | null;
}

// 作成/更新のタイムスタンプ表示。サーバの TZ に依存しないよう JST 固定
export function ItemTimestamps({ item }: ItemTimestampsProps) {
  return (
    <div className="text-sm text-gray-500">
      <div>
        作成:{" "}
        {item ? item.createdAt.toLocaleString("ja-JP", TIME_FORMAT) : "未作成"}
      </div>
      <div>
        更新: {item ? item.updatedAt.toLocaleString("ja-JP", TIME_FORMAT) : ""}
      </div>
    </div>
  );
}
