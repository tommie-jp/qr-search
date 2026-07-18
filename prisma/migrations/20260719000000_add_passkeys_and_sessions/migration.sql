-- パスキー (docs/29-パスキー計画.md)。認証手段を 1 つ足すための 2 つの表。
--
-- webauthn_credentials … 登録済みパスキーの**公開鍵**。秘密鍵は端末から
--   出てこないので、この表が漏れても成りすませない。
-- sessions … ログイン中の端末。生のトークンは Cookie にしか無く、ここには
--   sha256 だけを置く (pg_dump が漏れてもセッションを乗っ取れないように)。
--
-- どちらも既存の items / images には触らないので、失敗しても本文は無事。

CREATE TABLE "webauthn_credentials" (
    "id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    -- WebAuthn の署名カウンタは uint32。INTEGER (符号付き 32bit) では
    -- 上半分が入らないため BIGINT にする
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "token_hash" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);

-- 期限切れの掃除 (deleteMany where expiresAt < now) が seq scan にならないように
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- 全文検索の PGroonga インデックス (20260714193604 で作成) は Prisma スキーマで
-- 表現できず drift 扱いになる。prisma migrate はここでも DROP INDEX を自動生成した
-- ため採用せず、「無ければ張り直す」ことで冪等に保つ (20260718000000 と同じ)。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
