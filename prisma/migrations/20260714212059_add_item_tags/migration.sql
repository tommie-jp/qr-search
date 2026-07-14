-- タグ対応 (Ver2.x): memo から抽出したタグの派生キャッシュ列と GIN インデックスを追加する。
--
-- 検索は `tags @> ARRAY['xxx']` の配列包含 (GIN が効く)。タグの正本は memo 本文で、
-- 保存のたびに src/lib/tags.ts の extractTags() で再計算して格納する。
ALTER TABLE "items" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "items_tags_idx" ON "items" USING GIN ("tags");

-- 全文検索の PGroonga インデックス (20260714193604 で作成) は Prisma スキーマで
-- 表現できず drift 扱いになる。prisma migrate が自動生成する DROP をそのまま残すと
-- &@ 全文検索が壊れるため、DROP は採用せず「無ければ張り直す」ことで冪等に保つ。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
