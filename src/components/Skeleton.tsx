// loading.tsx 用の骨組み部品 (docs/11-アプリ的UIUX計画.md §1-3)。
// 中身を真似た凝った骨組みにはしない。遷移直後に「画面が変わった」ことが
// 伝わればよく、実物とずれると読み込み完了時にガタつくため

interface SkeletonProps {
  className?: string;
}

export function SkeletonLine({ className = "" }: SkeletonProps) {
  return <div className={`h-4 animate-pulse rounded bg-gray-200 ${className}`} />;
}

export function SkeletonBox({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded border border-gray-200 bg-white ${className}`}
    />
  );
}
