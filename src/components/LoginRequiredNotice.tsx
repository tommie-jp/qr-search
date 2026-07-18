import { LoginButton } from "@/components/LoginButton";
import { BOX_CLASS } from "@/components/ui";

// 「ログインが必要です」の案内 (docs/18-ログイン計画.md, docs/22-ノート公開計画.md §4)。
//
// 出どころが 2 つある:
//   - /login-required … proxy.ts が未ログインの画面 GET を rewrite する先
//   - /item, /print   … 自前判定の口 (proxy が素通しする) で、公開ノートで
//                       なかったとき自分で出す
//
// 文言を 2 か所に書くとずれるので、ここに 1 つだけ置く。
//
// **非公開のノートと未登録の itemNo で同じものを出すこと**。分けると
// /item/1, /item/2, … を順に叩くだけでノートの存在が数えられる (docs/22 §8)。
export function LoginRequiredNotice() {
  return (
    <div className={`${BOX_CLASS} flex flex-col items-start gap-4 py-6`}>
      <div className="space-y-1">
        <h1 className="text-lg font-bold">ログインが必要です</h1>
        <p className="text-gray-600">
          このページを見るにはログインしてください。
        </p>
      </div>
      <LoginButton variant="primary" />
    </div>
  );
}
