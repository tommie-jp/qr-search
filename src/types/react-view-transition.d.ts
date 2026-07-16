import type { ReactNode } from "react";

// React の <ViewTransition> (docs/11-アプリ的UIUX計画.md §4) の型。
//
// 実体は App Router が使う React canary (next/dist/compiled/react) にあり
// 実行時には存在するが、@types/react (19.2) はまだ宣言を持たないので補う。
// @types/react が ViewTransition を持ったらこのファイルは消す。
//
// 名前の対応は React の実装に合わせた最小限: enter / exit は「遷移の種類 →
// アニメーション名」の対応表 (Link の transitionTypes が種類を渡す)、
// default は種類の指定がない遷移での既定。
declare module "react" {
  type ViewTransitionClass = string | "none" | "auto";

  type ViewTransitionClassPerType =
    | ViewTransitionClass
    | Record<string, ViewTransitionClass>;

  interface ViewTransitionProps {
    children?: ReactNode;
    name?: string;
    default?: ViewTransitionClassPerType;
    enter?: ViewTransitionClassPerType;
    exit?: ViewTransitionClassPerType;
    update?: ViewTransitionClassPerType;
    share?: ViewTransitionClassPerType;
  }

  export const ViewTransition: (props: ViewTransitionProps) => ReactNode;
}
