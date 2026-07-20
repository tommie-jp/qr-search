import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnexImporter } from "@/components/EnexImporter";
import { isDemoMode } from "@/lib/appEnv";
import { requireUser } from "@/lib/session";

// サイト名は付けない。root layout の title.template が付ける
export const metadata: Metadata = {
  title: "インポート",
};

// Evernote (.enex) の取り込み画面 (docs/28-エクスポート計画.md §4)。
//
// proxy.ts も未ログインの画面 GET を止めるが、それは楽観的な検査であって
// 唯一の砦にはしない (docs/18 §4)。ここでも requireUser() で確かめる。
export default async function ImportSettingsPage() {
  // デモでは取り込みを出さない (docs/38-デモモード計画.md §4)。API 側でも塞ぐが、
  // URL 直打ちに備えてページも 404 に倒す
  if (isDemoMode()) {
    notFound();
  }
  await requireUser();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-bold">Evernote から取り込む</h1>
        <p className="text-gray-600">
          Evernote で書き出した .enex
          ファイルを選ぶと、中のノートをこのアプリのノートとして取り込みます。
          番号は空いている一番小さい番号から自動で振られます。
        </p>
        <p className="text-gray-600">
          本文は Markdown に変換します。リンクと画像・PDF
          は引き継ぎますが、フォントと文字サイズの指定は落ちます。
        </p>
      </div>
      <EnexImporter />
    </div>
  );
}
