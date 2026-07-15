import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { MarkdownView } from "@/components/MarkdownView";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `メモ記法 - ${SITE_NAME}`,
};

// docs/メモ記法.md をそのままヘルプページとして表示する。
// standalone ビルドに md を含めるため next.config.ts の
// outputFileTracingIncludes とセットで管理する
export default async function MemoDocsPage() {
  const markdown = await fs.readFile(
    path.join(process.cwd(), "docs", "メモ記法.md"),
    "utf-8",
  );
  // 見出しは md 側の h1 (# メモ記法) に任せる
  return <MarkdownView markdown={markdown} />;
}
