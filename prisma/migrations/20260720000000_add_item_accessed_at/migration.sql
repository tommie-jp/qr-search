-- アクセス順 (最近見た順) のための列 (docs/37-アクセス順計画.md)。
--
-- items に accessed_at を 1 列足すだけ。既存のデータも索引も落とさない。
--
-- **既存行は updated_at で埋める**。列の DEFAULT (now()) のままだと、移行した
-- 瞬間に全ノートが「たった今アクセスした」ことになり、アクセス順が全件同着で
-- 意味を成さなくなる。updated_at で初期化すれば、導入直後は更新順と同じ並びに
-- 見え、使うほどアクセス順に育っていく。
--
-- ゴミ箱の行も同じように埋める (復元したときに順序が飛ばないように)。

ALTER TABLE "items"
  ADD COLUMN "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "items" SET "accessed_at" = "updated_at";
