-- migration.sql
CREATE TYPE "crawl_kind" AS ENUM ('restaurant', 'happy_hour', 'student_discount', 'grocery_circular', 'local_promo');

CREATE TABLE "crawl_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "url" TEXT NOT NULL,
  "kind" "crawl_kind" NOT NULL,
  "merchant_hint" TEXT,
  "default_category_slug" TEXT,
  "zone_slug" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "crawl_interval_hours" INTEGER NOT NULL DEFAULT 24,
  "last_crawled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crawl_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crawl_sources_url_key" ON "crawl_sources"("url");
CREATE INDEX "crawl_sources_enabled_idx" ON "crawl_sources"("enabled");

CREATE TABLE "crawl_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id" UUID NOT NULL,
  "status" "ingestion_status" NOT NULL DEFAULT 'running',
  "fetched" INTEGER NOT NULL DEFAULT 0,
  "queued" INTEGER NOT NULL DEFAULT 0,
  "deduped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "crawl_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crawl_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "crawl_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "crawl_runs_source_id_started_at_idx" ON "crawl_runs"("source_id", "started_at");

CREATE TABLE "crawl_failures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "url" TEXT,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crawl_failures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crawl_failures_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "crawl_failures_run_id_idx" ON "crawl_failures"("run_id");

ALTER TABLE "deals" ADD COLUMN "confidence_score" INTEGER;
ALTER TABLE "deals" ADD COLUMN "crawl_source_id" UUID;
ALTER TABLE "deals" ADD CONSTRAINT "deals_crawl_source_id_fkey" FOREIGN KEY ("crawl_source_id") REFERENCES "crawl_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "deals_status_moderation_status_expires_at_idx" ON "deals"("status", "moderation_status", "expires_at");
