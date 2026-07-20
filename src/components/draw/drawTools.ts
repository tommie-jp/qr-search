// お絵かきの道具の一覧 (docs/34-お絵かき計画.md §2 / docs/36 §1)。
//
// useDrawCanvas と shapeTool の双方が要るので、循環 import を避けるために
// 型だけをここに置く。

export type DrawTool =
  | "pen"
  | "marker"
  | "fill"
  | "eraser"
  | "arrow"
  | "rect"
  | "ellipse"
  | "select"
  | "text";
