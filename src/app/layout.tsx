import type { Metadata, Viewport } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import pkg from "../../package.json";
import { ClientLogCapture } from "@/components/ClientLogCapture";
import { DebugConsole } from "@/components/DebugConsole";
import { DebugConsoleButton } from "@/components/DebugConsoleButton";
import { HeaderMenu } from "@/components/HeaderMenu";
import { HeaderQrButton } from "@/components/HeaderQrButton";
import { LoginButton } from "@/components/LoginButton";
import { LogoutButton } from "@/components/LogoutButton";
import { GithubIcon, KeyIcon, LogIcon } from "@/components/MenuIcons";
import { PasskeyLoginButton } from "@/components/PasskeyLoginButton";
import { StandaloneBackButton } from "@/components/StandaloneBackButton";
import { HEADER_MENU_ITEM_CLASS } from "@/components/ui";
import {
  isProductionEnv,
  LOCAL_THEME_COLOR,
  PROD_THEME_COLOR,
} from "@/lib/appEnv";
import { PASSKEY_SETTINGS_PATH } from "@/lib/authPaths";
import { currentUser } from "@/lib/session";
import { qrBaseUrl, SITE_DESCRIPTION, SITE_NAME, siteTitle } from "@/lib/site";
import "./globals.css";

// 静的な metadata / viewport オブジェクトではなく関数で出す。静的オブジェクトは
// モジュール読み込み時に一度だけ評価されるため、prerender されるルートができた
// 瞬間にビルド時 (APP_ENV なし = 非本番) の値が焼き付く。いまは layout が
// currentUser() 経由で cookies() を呼ぶので全ルートが動的だが、それは APP_ENV とは
// 無関係な事情であり、目印の正しさをその偶然に預けたくない
export function generateMetadata(): Metadata {
  const title = siteTitle();

  return {
    // template にするのが要点。子ページが title を出すと root の title は
    // まるごと上書きされ、非本番の [LOCAL] ごと消える (実際 /docs/* がそうだった)。
    // template なら子は見出しだけ書けばよく、サイト名と目印は必ずここが付ける
    title: { default: title, template: `%s - ${title}` },
    description: SITE_DESCRIPTION,
  };
}

// maximumScale / userScalable はあえて指定しない。ピンチズームを潰すと
// 型番など細かい文字を拡大できなくなるうえ、iOS Safari は無視する
export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    // standalone のステータスバー帯の色。ブラウザの URL バーが無い分、
    // 非本番だと気づけるかはこの帯とヘッダの色にかかっている
    themeColor: isProductionEnv() ? PROD_THEME_COLOR : LOCAL_THEME_COLOR,
    colorScheme: "light",
  };
}

const GITHUB_URL = "https://github.com/tommie-jp/qr-search";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // qrBaseUrl() 経由で読むこと。process.env.QR_BASE_URL を `??` で直読みすると
  // `.env` に `QR_BASE_URL=` と空で書いたとき空文字が素通しし、ヘッダの QR が
  // 空 URL になる (site.ts が `||` で既定へ倒しているのはこのため)
  const siteUrl = qrBaseUrl();
  const siteQrDataUrl = await QRCode.toDataURL(siteUrl, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });

  // ヘッダの帯はログインしていなくても出す (docs/18-ログイン計画.md)。
  // 未ログインならユーザー名の代わりにログインボタンを置く。
  // 中身を守るのは proxy.ts と requireUser() の役目で、この帯ではない。
  //
  // ログイン手段 (パスワード / パスキー) によらず必ずセッションを持つので
  // (docs/18 §11)、ログイン中なら常にログアウトを出してよい
  const user = await currentUser();

  // 非本番は画面全体をピンクに塗る。Tailwind はソース中のクラス名を文字列として
  // 探すため、`bg-${color}-50` のような組み立てをすると CSS が生成されない。
  // 完全なクラス名を両方書いて選ぶこと
  const isProd = isProductionEnv();

  return (
    <html lang="ja" className="h-full antialiased">
      <body
        className={`min-h-full text-gray-900 ${isProd ? "bg-gray-50" : "bg-pink-50"}`}
      >
        {/* 深くスクロールしても検索・ホームに戻れるよう貼り付ける (docs/11 §5)。
            pt-safe … standalone はステータスバーの下に潜り込む (viewport-fit=cover)。
            ブラウザで開いているときは inset が 0 で従来と同じ余白になる。
            本文はほぼ白いカードで覆われるため、body の色より常時見えている
            この帯の色のほうが「本番ではない」ことに気づく主な手がかりになる */}
        <header
          className={`sticky top-0 z-20 border-b backdrop-blur print:hidden ${
            isProd ? "border-gray-200 bg-white/95" : "border-pink-300 bg-pink-100/95"
          }`}
        >
          {/* 帯は低く抑える。ボタン側が min-h-11 (44px) を負のマージンで
              はみ出させているので、見た目 40px でもタップ目標は 44px を保つ */}
          {/* items-baseline … サイト名 (text-lg)・バージョン (text-xs)・
              ユーザー名 (text-base) と文字の大きさが揃わないので、中央揃えでは
              下端がバラバラに見える。全員の文字のベースラインを 1 本に載せる */}
          <div className="mx-auto flex max-w-2xl items-baseline gap-2 px-safe pt-safe">
            {/* 項目はハンバーガーメニューへ畳む (docs/11-アプリ的UIUX計画.md §6)。
                横に並べていたときは iPhone の幅で 1 文字ずつ折り返れて崩れた。
                左端に置くのは、片手持ちの親指が届く側だから */}
            <HeaderMenu>
              <HeaderQrButton
                qrDataUrl={siteQrDataUrl}
                url={siteUrl}
                variant="menu"
              />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={HEADER_MENU_ITEM_CLASS}
              >
                <GithubIcon />
                GitHub
              </a>
              {user ? (
                <>
                  {/* サーバログ (docs/21)。未ログインではリンク自体を出さない —
                      見えても 401 だが、押せない物を見せない */}
                  <Link href="/logs" className={HEADER_MENU_ITEM_CLASS}>
                    <LogIcon />
                    ログ
                  </Link>
                  {/* その場で見る側のログ (docs/30-ブラウザログ計画.md §2)。
                      /logs は事後に読むもので、network まで見たいときは
                      端末の上に DevTools 相当を出すしかない */}
                  <DebugConsoleButton />
                  {/* パスキーの管理 (docs/29-パスキー計画.md §8)。
                      ここが登録への唯一の導線なので、ログイン中は常に出す */}
                  <Link
                    href={PASSKEY_SETTINGS_PATH}
                    className={HEADER_MENU_ITEM_CLASS}
                  >
                    <KeyIcon />
                    パスキー
                  </Link>
                  <LogoutButton variant="menu" />
                </>
              ) : (
                <>
                  <PasskeyLoginButton variant="menu" />
                  <LoginButton variant="menu" label="パスワードでログイン" />
                </>
              )}
            </HeaderMenu>
            <StandaloneBackButton />
            {/* アイコンもホームリンクに含める。押せる的が広がるうえ、
                アイコンとサイト名が別々の当たり判定に割れるのを避ける。
                /icon.svg は app/icon.svg が規約で配信するもの (PNG より
                拡大に強い)。alt は空 — 隣の文字が同じことを言っている */}
            <Link
              href="/"
              className="inline-flex items-baseline gap-1.5 text-lg font-bold"
            >
              {/* h-[1cap] … アイコンの高さをサイト名の大文字 (Q) と同じにする。
                  items-baseline で img の下端 (= 置換要素のベースライン) が
                  文字のベースラインに載り、上端が Q の頭と揃う */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" className="h-[1cap] w-auto rounded-[2px]" />
              {SITE_NAME}
            </Link>
            <span className="text-xs text-gray-400">v{pkg.version}</span>
            {/* 色には数日で慣れて見えなくなるので、文字でも書く */}
            {!isProd && (
              <span
                className="rounded bg-pink-600 px-1.5 py-0.5 text-xs font-bold text-white"
                title="ローカル環境。ここでの更新は本番 (qr.tommie.jp) に反映されない"
              >
                LOCAL
              </span>
            )}
            {/* ユーザー名だけはメニューの外に残す — 「誰で入っているか」は
                一目で確かめたい情報で、押す物でもないため */}
            {user && (
              <span
                className="ml-auto max-w-24 truncate text-gray-500"
                title={`${user} でログイン中`}
              >
                {user}
              </span>
            )}
          </div>
        </header>
        {/* 遷移アニメーションは各ページの <PageTransition> が持つ
            (layout の要素は unmount されず enter/exit が起きないため) */}
        <main className="mx-auto max-w-2xl px-safe pt-6 pb-safe">{children}</main>
        {/* どちらも何も描かない (docs/30-ブラウザログ計画.md)。
            転送はログイン中だけ仕掛ける — 受け口は 401 を返すので、
            未ログインで拾っても運べず、無駄な要求になる。
            eruda は逆に未ログインでも要る。「ログインできない不具合」の
            手掛かりはブラウザ側にしか無く、そのとき転送は使えない */}
        {user && <ClientLogCapture />}
        <DebugConsole />
      </body>
    </html>
  );
}
