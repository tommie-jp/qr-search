import type { Metadata } from "next";
import { LoginButton } from "@/components/LoginButton";
import { BOX_CLASS } from "@/components/ui";

// サイト名は付けない。root layout の title.template が付ける
// (手で連結すると非本番の [LOCAL] が抜け落ちる)
export const metadata: Metadata = {
  title: "ログインが必要です",
};

// 未ログインで保護された画面を開いたときの案内 (docs/18-ログイン計画.md)。
//
// proxy.ts がここへ rewrite する。redirect ではないのでアドレス欄は元の URL
// (例: /item/ABC123) のまま。ログインすれば再読み込みだけでその場に戻る。
//
// 直接 /login-required を開くこともできる (publicPaths.ts で公開している) が、
// 出るのはこの案内だけなので害はない。
export default function LoginRequiredPage() {
  return (
    <div className={`${BOX_CLASS} flex flex-col items-start gap-4 py-6`}>
      <div className="space-y-1">
        <h1 className="text-lg font-bold">ログインが必要です</h1>
        <p className="text-sm text-gray-600">
          このページを見るにはログインしてください。
        </p>
      </div>
      <LoginButton variant="primary" />
    </div>
  );
}
