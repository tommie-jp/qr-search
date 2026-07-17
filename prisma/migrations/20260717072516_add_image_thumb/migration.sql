-- 一覧のサムネイル (Ver2.x): images に縮小画像の派生キャッシュ列を追加する。
--
-- 検索結果をカード表示にすると 1 ページに 20 枚の画像が並ぶ。原寸のまま配ると
-- スマホ写真 1 枚が数 MB あるため一覧として実用にならない (CSS で小さく見せても
-- バイト数は減らない)。保存時に 1 度だけ縮小して持ち、一覧はこちらを配る
-- (src/lib/thumbnail.ts / docs/23-検索結果表示モード計画.md §2)。
--
-- NULL 可なのは、既存行がバックフィル (scripts/backfillThumbs.ts) まで空になる
-- ことと、壊れた画像で生成に失敗しうるため。NULL のときは配信側が原寸で代替する
-- ので画像が割れることはない。data から再生成できる派生値なので、消えても実害はない。
ALTER TABLE "images" ADD COLUMN "thumb" BYTEA;

-- 全文検索の PGroonga インデックス (20260714193604 で作成) は Prisma スキーマで
-- 表現できず drift 扱いになる。prisma migrate はここでも DROP INDEX を自動生成した
-- ため採用せず、「無ければ張り直す」ことで冪等に保つ (20260715111735 と同じ)。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
