import type { Metadata } from "next";
import Link from "next/link";
import pkg from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "QR search",
  description: "部品に貼った QR シールから部品情報を表示・管理する",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-gray-50 text-gray-900">
        <header className="border-b border-gray-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold">
              QR search
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-2xl px-4 py-6 text-center text-xs text-gray-400 print:hidden">
          QR search v{pkg.version}
        </footer>
      </body>
    </html>
  );
}
