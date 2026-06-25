-- P3: Gemini-generated feed metadata on places (all nullable / defaulted), so a
-- discovered place is feed-ready even when scraped deals are sparse.
ALTER TABLE "places" ADD COLUMN "price_bucket" TEXT;
ALTER TABLE "places" ADD COLUMN "student_value_score" DOUBLE PRECISION;
ALTER TABLE "places" ADD COLUMN "affordability_score" DOUBLE PRECISION;
ALTER TABLE "places" ADD COLUMN "best_for" TEXT;
ALTER TABLE "places" ADD COLUMN "vibe_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "places" ADD COLUMN "category_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "places" ADD COLUMN "why_recommended" TEXT;
ALTER TABLE "places" ADD COLUMN "confidence_label" TEXT;
ALTER TABLE "places" ADD COLUMN "deal_likelihood_score" DOUBLE PRECISION;
ALTER TABLE "places" ADD COLUMN "hidden_gem_score" DOUBLE PRECISION;
ALTER TABLE "places" ADD COLUMN "cheap_eats_score" DOUBLE PRECISION;
ALTER TABLE "places" ADD COLUMN "feed_section_candidates" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "places" ADD COLUMN "enriched_at" TIMESTAMP(3);
ALTER TABLE "places" ADD COLUMN "enrichment_hash" TEXT;

CREATE INDEX "places_enriched_at_idx" ON "places"("enriched_at");
