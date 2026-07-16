// ローカル (http://127.0.0.1:3000) を本番と勘違いしてデータを更新する事故が
// 続いたため、非本番の画面はピンクに塗って一目で見分けられるようにする。
// ここがその判定の唯一の出どころ。

// 「APP_ENV=production を明示したときだけ本番」とし、それ以外はすべて非本番扱いに倒す。
// 設定漏れ・新しい起動方法・ポートフォワード経由といった想定外の経路が
// すべて「ピンクになる (実害なし)」側に落ちるようにするため。逆向きに倒すと、
// 想定外の経路がそのまま本番の見た目になり、防ぎたかった事故がそのまま起きる。
//
// NODE_ENV は使わない。doStart.sh (ローカルを docker compose で本番相当に起動) や
// `next build && next start` は NODE_ENV=production になるが、その経路こそが
// 127.0.0.1:3000 を本番そっくりに見せている当人であり、警告を消してはいけない。
//
// ホスト名 (headers() の host) でも判定しない。0.0.0.0 で起動して LAN の別名で
// 開く・トンネル経由で開くなどですり抜けるうえ、判定漏れが本番側に倒れる。
export function isProductionEnv(): boolean {
  return process.env.APP_ENV === "production";
}

// 非本番の目印に使う色。ヘッダは Tailwind のクラスで塗る一方、
// meta[theme-color] と PWA manifest は hex の直値しか受け取らないため、
// 対応する hex をここに控えて両者がずれないようにする。
// (themeColor = ヘッダの色、backgroundColor = body の色)
export const LOCAL_THEME_COLOR = "#fce7f3"; // bg-pink-100 相当
export const LOCAL_BACKGROUND_COLOR = "#fdf2f8"; // bg-pink-50 相当
export const PROD_THEME_COLOR = "#ffffff"; // ヘッダ白
export const PROD_BACKGROUND_COLOR = "#f9fafb"; // bg-gray-50 相当
