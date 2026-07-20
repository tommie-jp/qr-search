// turndown-plugin-gfm (表・取り消し線・チェックボックスを turndown に足す) の型。
//
// 実体は型を同梱していない CJS で、@types も公開されていない (実測: 404)。
// ENEX インポートの ENML → Markdown 変換 (src/lib/enex/enmlToMarkdown.ts,
// docs/28-エクスポート計画.md §4) で使う分だけ宣言する。
// 上流が型を同梱したらこのファイルは消す。
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  // turndown の use() が受け取るプラグインの形
  type Plugin = (service: TurndownService) => void;

  // 下の個別プラグインをまとめて適用する
  export const gfm: Plugin;

  export const highlightedCodeBlock: Plugin;
  export const strikethrough: Plugin;
  export const tables: Plugin;
  export const taskListItems: Plugin;
}
