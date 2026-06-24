ALTER TABLE "crawl_sources" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'merchant_site';
ALTER TABLE "crawl_sources" ADD COLUMN "deal_url" TEXT;
ALTER TABLE "crawl_sources" ADD COLUMN "target_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "crawl_sources" ADD COLUMN "reliability_score" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "crawl_sources" ADD COLUMN "last_success_at" TIMESTAMP(3);
ALTER TABLE "crawl_sources" ADD COLUMN "average_deals_found" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "crawl_runs" ADD COLUMN "firecrawl_pages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crawl_runs" ADD COLUMN "unchanged" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "deal_candidates" ADD COLUMN "promoted_at" TIMESTAMP(3);

CREATE INDEX "crawl_sources_reliability_score_idx" ON "crawl_sources"("reliability_score");
CREATE INDEX "crawl_runs_unchanged_idx" ON "crawl_runs"("source_id", "unchanged", "started_at");
CREATE INDEX "deal_candidates_promoted_at_idx" ON "deal_candidates"("promoted_at");
