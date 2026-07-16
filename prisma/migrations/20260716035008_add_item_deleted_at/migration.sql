-- ゴミ箱 (Ver2.x): 二段階削除のための deleted_at 列を追加する。
--
-- null = 通常、非 null = ゴミ箱行き日時。検索・タグ集計は null の行だけを見る
-- (src/lib/items.ts)。永久削除は行の DELETE で、そこで初めて itemNo が解放される。
-- 数百件規模なので索引は張らない (props と同じ判断で seq scan で足りる)。
ALTER TABLE "items" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- 全文検索の PGroonga インデックスは Prisma スキーマで表現できず drift 扱いになり、
-- 自動生成では DROP INDEX が出る (今回も出た)。DROP は採用せず、
-- 20260715111735_add_item_props と同じく「無ければ張り直す」ことで冪等に保つ。
-- &@ は索引が無くても seq scan で動いてしまい、消えても気づけないため。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
