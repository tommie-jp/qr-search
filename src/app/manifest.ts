import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// PWA の manifest。/manifest.webmanifest で配信される。
//
// 注意: ブラウザは manifest とアイコンを **Authorization ヘッダなし** で取得するため、
// 逆プロキシ側でこれらのパスだけ Basic 認証を外さないと 401 になり、
// 「インストール可能」と判定されない。本番 (vps2 の nginx) とローカル (Caddyfile) の
// 両方に除外設定が要る。詳細は 41-QR-search/docs/05-PWA計画.md
//
// Service Worker は置かない。Chrome のインストール条件は manifest + アイコンで足り、
// このアプリは検索も表示も編集もサーバ必須でオフラインに出来ることがほぼないため。
export default function manifest(): MetadataRoute.Manifest {
  return {
    // id を省くと start_url が既定の識別子になり、後で start_url を変えたときに
    // 「別アプリ」と見なされて二重インストールになる
    id: "/",
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "ja",
    start_url: "/",
    // scope 内の URL は Android の WebAPK が intent filter で捕まえる。
    // QR シールの /item/:itemNo を拾わせたいのでルートに広げる
    scope: "/",
    display: "standalone",
    background_color: "#f9fafb", // bg-gray-50 = body の背景 (起動時スプラッシュに出る)
    theme_color: "#ffffff", // ヘッダ白。layout.tsx の viewport.themeColor と揃える
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // ランチャーが好きな形に切り抜く版。any と兼用にすると、切り抜きに耐える
      // 余白の分だけ通常表示で絵が小さくなるので、別ファイルに分ける
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
