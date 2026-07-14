import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 用の自己完結ビルド (.next/standalone)
  output: "standalone",
  // /docs/memo が実行時に読む md を standalone に同梱する
  outputFileTracingIncludes: {
    "/docs/memo": ["./docs/**/*"],
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
