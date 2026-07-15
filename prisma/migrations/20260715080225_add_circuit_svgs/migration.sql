-- DropIndex
DROP INDEX "items_memo_url_pgroonga_idx";

-- CreateTable
CREATE TABLE "circuit_svgs" (
    "hash" TEXT NOT NULL,
    "svg" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_svgs_pkey" PRIMARY KEY ("hash")
);
