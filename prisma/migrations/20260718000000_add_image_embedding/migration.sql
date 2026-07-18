-- 画像検索 (Ver2.x): images に埋め込みベクトルの派生キャッシュ列を追加する。
--
-- カメラで映した部品を登録済みノートの写真と照合するため、画像を 1 本の
-- ベクトル (Float32Array、正規化済み) にして持つ。照合はクライアントで
-- 総当たり cosine を取る (src/lib/imageVector.ts / docs/25-画像検索計画.md §1,4)。
--
-- NULL 可なのは、既存行がバックフィル (scripts/backfillEmbeddings.mjs) まで空に
-- なることと、壊れた画像や未対応形式で生成に失敗しうるため。NULL の画像は索引
-- から外れる (検索対象にならないだけで、画像そのものは今までどおり配れる)。
-- data から再生成できる派生値なので、消えても実害はない (thumb と同じ扱い)。
ALTER TABLE "images" ADD COLUMN "embedding" BYTEA;

-- 全文検索の PGroonga インデックス (20260714193604 で作成) は Prisma スキーマで
-- 表現できず drift 扱いになる。prisma migrate はここでも DROP INDEX を自動生成した
-- ため採用せず、「無ければ張り直す」ことで冪等に保つ (20260717072516 と同じ)。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
