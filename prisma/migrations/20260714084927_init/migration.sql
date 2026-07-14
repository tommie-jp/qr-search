-- CreateEnum
CREATE TYPE "Mode" AS ENUM ('memo', 'url');

-- CreateTable
CREATE TABLE "items" (
    "item_no" TEXT NOT NULL,
    "item_no_num" INTEGER,
    "memo" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "mode" "Mode" NOT NULL DEFAULT 'memo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("item_no")
);

-- CreateIndex
CREATE INDEX "items_item_no_num_idx" ON "items"("item_no_num");
