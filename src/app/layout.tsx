import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import pkg from "../../package.json";
import { HeaderQrButton } from "@/components/HeaderQrButton";
import { StandaloneBackButton } from "@/components/StandaloneBackButton";
import { parseBasicAuthUser } from "@/lib/auth";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
};

// maximumScale / userScalable はあえて指定しない。ピンチズームを潰すと
// 型番など細かい文字を拡大できなくなるうえ、iOS Safari は無視する
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

const SITE_URL = process.env.QR_BASE_URL ?? "https://qr.tommie.jp";
const GITHUB_URL = "https://github.com/tommie-jp/qr-search";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteQrDataUrl = await QRCode.toDataURL(SITE_URL, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });

  // Basic 認証は Caddy 側で行うため、直接 next dev を叩く開発時は
  // Authorization ヘッダーがなく null になる。その場合は何も出さない
  const user = parseBasicAuthUser((await headers()).get("authorization"));

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-gray-50 text-gray-900">
        {/* 深くスクロールしても検索・ホームに戻れるよう貼り付ける (docs/11 §5)。
            pt-safe … standalone はステータスバーの下に潜り込む (viewport-fit=cover)。
            ブラウザで開いているときは inset が 0 で従来と同じ余白になる */}
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-safe pt-safe pb-3">
            <StandaloneBackButton />
            <Link href="/" className="text-lg font-bold">
              {SITE_NAME}
            </Link>
            <span className="text-xs text-gray-400">v{pkg.version}</span>
            <div className="ml-auto flex items-baseline gap-3">
              <HeaderQrButton qrDataUrl={siteQrDataUrl} url={SITE_URL} />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                GitHub
              </a>
              {user && (
                <span className="text-sm text-gray-500" title="ログイン中">
                  {user}
                </span>
              )}
            </div>
          </div>
        </header>
        {/* 遷移アニメーションは各ページの <PageTransition> が持つ
            (layout の要素は unmount されず enter/exit が起きないため) */}
        <main className="mx-auto max-w-2xl px-safe pt-6 pb-safe">{children}</main>
      </body>
    </html>
  );
}
