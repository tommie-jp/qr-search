import { SkeletonBox, SkeletonLine } from "@/components/Skeleton";

// /item/:itemNo の遷移中に即座に出す骨組み (docs/11-アプリ的UIUX計画.md §1-3)。
// 回路図 (TeX) を含むノートはサーバの描画に時間がかかるので、ここが特に効く
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <SkeletonLine className="w-28" />
        <SkeletonLine className="w-32" />
      </div>
      {/* タブ + 本文 */}
      <SkeletonLine className="w-48" />
      <SkeletonBox className="h-72" />
    </div>
  );
}
