// デモインスタンスの常時バナー (docs/38-デモモード計画.md §6)。
//
// 目的は 2 つ — 悪用の抑止と、消えるデータであることの明示 (免責)。
// ピンク ([LOCAL] の印) と混同しないよう amber で塗る。layout が
// isDemoMode() のときだけ描く (このコンポーネント自身は env を見ない)。
//
// ログイン導線は別に出さない。Basic 認証のネイティブダイアログには説明を
// 出せないため、資格情報の案内が要るならここに足すのが妥当だが、公開する
// 資格情報が決まってから入れる (いまは注意書きだけ)。
export function DemoBanner() {
  return (
    <div className="border-b border-amber-300 bg-amber-100 text-amber-900 print:hidden">
      <div className="mx-auto max-w-2xl px-safe py-2 text-sm landscape-phone:max-w-4xl">
        <span className="font-bold">デモ環境です。</span>{" "}
        保存したデータは定期的にすべて削除されます。個人情報や不適切なファイルは
        アップロードしないでください。
      </div>
    </div>
  );
}
