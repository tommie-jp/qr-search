-- 全文検索 (Ver2.1): PGroonga 拡張と memo/url の全文検索インデックスを追加する。
--
-- 前提: DB イメージは PGroonga 入りの PostgreSQL
--       (compose.yaml の groonga/pgroonga:*-alpine-16)。
-- 既定のトークナイザ TokenBigram / ノーマライザ NormalizerAuto を使うため、
-- 日本語のバイグラム検索と全角/半角・大小文字の正規化が有効になる。
-- itemNo の前方一致検索はアプリ側で ILIKE を使うためインデックス対象に含めない。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX "items_memo_url_pgroonga_idx" ON "items" USING pgroonga ("memo", "url");
