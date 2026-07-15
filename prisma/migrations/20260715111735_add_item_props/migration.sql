-- プロパティ対応 (Ver2.x): memo のプロパティ行から抽出した派生キャッシュ列を追加する。
--
-- 「行全体が key=value だけの行」(hFE=208 Vf=700mV) を src/lib/props.ts の
-- extractProps() で抽出し、[{ key, label, value }] の配列として保存する。
-- 正本は memo 本文で、保存のたびに再計算する (tags と同じ流儀)。
-- タグ検索時の特性表 (PropsTable) の表示にのみ使い、WHERE では props <> '[]' しか
-- 見ないためインデックスは張らない (個人規模のテーブルで seq scan で足りる)。
ALTER TABLE "items" ADD COLUMN "props" JSONB NOT NULL DEFAULT '[]';

-- 全文検索の PGroonga インデックス (20260714193604 で作成) は Prisma スキーマで
-- 表現できず drift 扱いになる。prisma migrate が自動生成する DROP をそのまま残すと
-- 索引が消えるため、DROP は採用せず「無ければ張り直す」ことで冪等に保つ。
--
-- 実際に 20260715080225_add_circuit_svgs では自動生成の DROP INDEX が手編集されずに
-- 適用され、この索引は失われていた。&@ は索引が無くても seq scan で動いてしまうため
-- 検索結果は出続け、遅くなるだけで気づけない。適用済みマイグレーションは履歴なので
-- 直さず (checksum が変わる)、ここで張り直して回復させる。
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX IF NOT EXISTS "items_memo_url_pgroonga_idx"
  ON "items" USING pgroonga ("memo", "url");
