import type { Metadata } from "next";

// クレジット / 帰属表示のページ (docs/46-クレジット表記計画.md)。
//
// **設定系 (パスキー等) と違い、デモでも隠さず・ログイン前でも見せてよい。**
// Yahoo!デベロッパーネットワークはクレジット表示が義務で、外部 API を使う
// 事実は誰に対しても表示してよい情報なので、requireUser() も notFound() も
// 掛けない。
//
// サイト名は付けない。root layout の title.template が付ける
export const metadata: Metadata = {
  title: "クレジット",
};

// Yahoo! の規定クレジット (docs/46 §1-1)。
//
// **一字一句この HTML のまま出す。** 規約で改変 (CSS での色変更・極端な縮小・
// リンク先や文言の変更) が禁止されているため、JSX で組み直さず規定ソースを
// そのまま挿入する。target/rel も規定に無いので足さない。
// 最新の規定は https://developer.yahoo.co.jp/attribution/ で確認する。
const YAHOO_ATTRIBUTION_HTML =
  '<!-- Begin Yahoo! JAPAN Web Services Attribution Snippet -->\n' +
  '<span style="margin:15px 15px 15px 15px"><a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a></span>\n' +
  "<!-- End Yahoo! JAPAN Web Services Attribution Snippet -->";

// このアプリが使う Web サービスの帰属表示 (docs/46 §1)。
export default function AboutPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-bold">クレジット</h1>
        <p className="text-gray-600">
          本アプリは、書籍・商品情報の取得に以下の Web
          サービスを利用しています。
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">Yahoo!ショッピング (JAN 商品情報)</h2>
        <p className="text-gray-600">
          JAN コードからの商品名・ブランドの取得に、Yahoo!ショッピング商品検索
          API を利用しています。
        </p>
        {/* 規定 HTML をそのまま挿入する (改変禁止のため JSX で組み直さない)。
            静的な定数で、ユーザー入力は一切混じらない */}
        <div
          className="text-blue-700 underline"
          dangerouslySetInnerHTML={{ __html: YAHOO_ATTRIBUTION_HTML }}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">楽天ブックス (書影)</h2>
        <p className="text-gray-600">
          書影 (カバー画像) の取得に、楽天ブックス書籍検索 API を利用しています。
        </p>
        <p>
          <a
            href="https://webservice.rakuten.co.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline"
          >
            Supported by Rakuten Developers
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">openBD / 国立国会図書館サーチ (書誌)</h2>
        <p className="text-gray-600">
          書名・著者などの書誌情報は、
          <a
            href="https://openbd.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline"
          >
            openBD
          </a>
          および
          <a
            href="https://ndlsearch.ndl.go.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline"
          >
            国立国会図書館サーチ
          </a>
          の提供データを利用しています。
        </p>
      </section>
    </div>
  );
}
