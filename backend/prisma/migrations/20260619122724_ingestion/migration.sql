-- CreateEnum
CREATE TYPE "ingestion_status" AS ENUM ('running', 'succeeded', 'failed');

-- AlterTable (geog DROP-INDEX / DROP-DEFAULT stripped — managed by raw SQL)
ALTER TABLE "deals" ADD COLUMN     "fingerprint" TEXT;

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ingestion_status" NOT NULL DEFAULT 'running',
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "upserted" INTEGER NOT NULL DEFAULT 0,
    "deduped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_failures" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "external_id" TEXT,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_runs_provider_started_at_idx" ON "ingestion_runs"("provider", "started_at");

-- CreateIndex
CREATE INDEX "ingestion_failures_run_id_idx" ON "ingestion_failures"("run_id");

-- CreateIndex
CREATE INDEX "deals_fingerprint_idx" ON "deals"("fingerprint");

-- AddForeignKey
ALTER TABLE "ingestion_failures" ADD CONSTRAINT "ingestion_failures_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

