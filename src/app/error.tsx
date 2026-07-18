"use client";

// サーバアクションや描画で予期しないエラーが起きたときの受け皿。
// これが無いと本番では Next.js の無装飾なエラー画面になる
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4 py-8 text-center">
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="text-gray-600">
        操作をやり直してください。繰り返し発生する場合はサーバログを確認してください。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded bg-blue-600 px-6 py-2 font-medium text-white"
      >
        再試行
      </button>
    </div>
  );
}
