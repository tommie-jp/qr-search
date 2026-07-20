// @mixmark-io/domino (turndown が内部で使っている DOM 実装) の型。
//
// 同梱の lib/index.d.ts は `declare module 'domino'` (fork 前のパッケージ名) を
// 宣言しているだけで、`@mixmark-io/domino` を import すると
// 「File is not a module」になる。ここで正しい名前に宣言し直す。
//
// 直接使うのは ENEX インポートの表の見出し行を足すところだけ
// (src/lib/enex/enmlToMarkdown.ts、docs/28-エクスポート計画.md §4)。
// turndown と同じパーサを使うことで、こちらで組んだ木と turndown の解釈が
// ずれないようにしている。上流が型を直したらこのファイルは消す。
declare module "@mixmark-io/domino" {
  export function createDocument(html?: string, force?: boolean): Document;
  export function createWindow(html?: string, address?: string): Window;

  const domino: {
    createDocument: typeof createDocument;
    createWindow: typeof createWindow;
  };

  export default domino;
}
