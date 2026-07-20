import type { MetadataRoute } from "next";
import { isDemoMode } from "@/lib/appEnv";

// robots.txt (docs/39-デモ公開計画.md §3)。
//
// force-dynamic で毎回 DEMO_MODE を評価する。robots は既定でビルド時に静的化
// されるが、デモは本番と**同一イメージ**を使い回す (docs/39 §5) ため、
// ビルド時の値 (DEMO_MODE 未設定 = allow) を焼き付けると、デモインスタンスでも
// allow を配ってしまう。起動時の env をランタイムで読むのが要
// (layout の generateMetadata を関数にしているのと同じ理由)。
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (isDemoMode()) {
    // デモは検索結果に載せない。guest が上げた内容を巻き込んで
    // インデックスされる事故を防ぐ
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  // 本番/ローカルは全許可。公開ノートを検索エンジンに載せない方針は
  // ページ側の noindex metadata (item / print) が担う。robots.txt で crawl 自体を
  // 止めると、その noindex を読んでもらえなくなるため、ここは許可が正しい。
  return { rules: { userAgent: "*", allow: "/" } };
}
