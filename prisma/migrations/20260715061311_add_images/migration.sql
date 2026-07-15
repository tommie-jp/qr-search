-- 画像の DB 格納 (Ver2.x): memo に挿入した画像を uploads volume から DB へ移す。
--
-- 画像本体は bytea (data)。10MB 上限のため TOAST 送りになり、items 側の検索には影響しない。
-- name は既に発番済みの "UUID.拡張子" をそのまま引き継ぐため、
-- 既存メモ内の /api/images/<name> リンクは変更なしで生き続ける。
CREATE TABLE "images" (
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("name")
);

-- 全文検索の PGroonga インデックス (20260714193604 で作成) は Prisma スキーマで
-- 表現できず drift 扱いになる。prisma migrate が自動生成する DROP をそのまま残すと
-- &@ 全文検索が壊れるため、DROP は採用せず「無ければ張り直す」ことで冪等に保つ。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
