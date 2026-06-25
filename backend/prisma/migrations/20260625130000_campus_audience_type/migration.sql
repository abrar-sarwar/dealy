ALTER TABLE "deal_candidates" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'general', ADD COLUMN "campus_deal_type" TEXT;
ALTER TABLE "deals" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'general', ADD COLUMN "campus_deal_type" TEXT;
