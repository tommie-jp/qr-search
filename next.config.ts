import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 用の自己完結ビルド (.next/standalone)
  output: "standalone",
  // node-tikzjax は TeX の core dump などを __dirname 相対で読むため、
  // バンドルせず素のパッケージのまま standalone へ運ばせる。
  // src/lib/circuitikz.ts の _traceNodeTikzjax がこれと対で効く
  serverExternalPackages: ["node-tikzjax"],
  // /docs/memo・/docs/search が実行時に読む md を standalone に同梱する
  outputFileTracingIncludes: {
    "/docs/memo": ["./docs/**/*"],
    "/docs/search": ["./docs/**/*"],
    // 回路図の描画スクリプトは意図的に Next のバンドル対象外 (子プロセスで
    // 起動する素の CJS) なので、tracer からは見えない。明示的に同梱する。
    //
    // キーは picomatch のルート glob。[itemNo] を書くと文字クラスと解釈され、
    // どのルートにもマッチせず「黙って何も同梱されない」ためエスケープする
    "/item/\\[itemNo\\]": ["./scripts/renderCircuit.cjs"],
  },
  // Ver1 の旧 URL 互換。/item/:itemNo は同一パスで実装済みのため不要
  async redirects() {
    return [
      { source: "/config/:itemNo", destination: "/", permanent: false },
      { source: "/config", destination: "/", permanent: false },
      { source: "/search", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
