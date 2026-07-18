import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 意図的に捨てる変数・引数は _ 始まりで表す (例: props から node を除外)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // 回路図の描画スクリプトは Next のバンドルを通さず node が直接起動する
    // 素の CommonJS なので、require() を使う (ESM 化すると子プロセスとして
    // 動かなくなる)
    files: ["scripts/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 静的アセット。node_modules から複製した vendor の wasm グルー (.mjs) を
    // 含み (copyOnnxWasm / copyEmbeddingWasm など)、自分のコードではないので
    // lint 対象にしない
    "public/**",
  ]),
]);

export default eslintConfig;
