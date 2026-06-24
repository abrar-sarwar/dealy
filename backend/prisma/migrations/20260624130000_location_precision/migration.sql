-- Add locationPrecision to deals and deal_candidates.
-- NOT NULL with DEFAULT 'approximate': safe additive change, no data loss.
ALTER TABLE "deals"
  ADD COLUMN "location_precision" TEXT NOT NULL DEFAULT 'approximate';

ALTER TABLE "deal_candidates"
  ADD COLUMN "location_precision" TEXT NOT NULL DEFAULT 'approximate';
