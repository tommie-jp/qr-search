-- ノート公開 (Ver2.x): 公開日時の public_at 列を追加する。
--
-- null = 非公開、非 null = 公開した日時。非 null のノートだけがログイン
-- していない人にも /item/<itemNo> で開ける (src/lib/publicItem.ts が正本)。
-- 既存行は NULL = 非公開で入るので、移行で公開に倒れるノートはない。
-- 数百件規模なので索引は張らない (deleted_at / props と同じ判断で seq scan で足りる)。
ALTER TABLE "items" ADD COLUMN "public_at" TIMESTAMP(3);

-- 全文検索の PGroonga インデックスは Prisma スキーマで表現できず drift 扱いになり、
-- 自動生成では DROP INDEX が出る。DROP は採用せず、20260716035008 と同じく
-- 「無ければ張り直す」ことで冪等に保つ。
-- &@ は索引が無くても seq scan で動いてしまい、消えても気づけないため。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
