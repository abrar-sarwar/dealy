-- P2: link discovered Places to crawl sources, deal candidates, and promoted deals.
ALTER TABLE "crawl_sources" ADD COLUMN "place_id" UUID;
ALTER TABLE "deal_candidates" ADD COLUMN "place_id" UUID;
ALTER TABLE "deals" ADD COLUMN "place_id" UUID;

-- One crawl source per place: upsert keys on this unique constraint.
CREATE UNIQUE INDEX "crawl_sources_place_id_key" ON "crawl_sources"("place_id");
CREATE INDEX "deal_candidates_place_id_idx" ON "deal_candidates"("place_id");
CREATE INDEX "deals_place_id_idx" ON "deals"("place_id");

ALTER TABLE "crawl_sources"
  ADD CONSTRAINT "crawl_sources_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_candidates"
  ADD CONSTRAINT "deal_candidates_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
