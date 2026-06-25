-- Area-aware deal-quality score.
-- DealCandidate gains the score + its two Gemini-supplied inputs; Deal gains the
-- promoted score. Backfill defaults to 0 (NOT NULL) so existing rows stay valid.
ALTER TABLE "deal_candidates"
  ADD COLUMN "quality_score" double precision NOT NULL DEFAULT 0,
  ADD COLUMN "area_relevance" double precision,
  ADD COLUMN "concrete_offer_score" double precision;

ALTER TABLE "deals"
  ADD COLUMN "quality_score" double precision NOT NULL DEFAULT 0;
