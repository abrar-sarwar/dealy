-- AlterEnum: new interaction signals for the personalization foundation.
ALTER TYPE "interaction_type" ADD VALUE IF NOT EXISTS 'impression';
ALTER TYPE "interaction_type" ADD VALUE IF NOT EXISTS 'open';

-- AlterTable: structured (coordinate-free) signal metadata + dedupe key.
ALTER TABLE "deal_interactions"
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "dedupe_key" TEXT;

-- CreateIndex: collapse duplicate events (e.g. one impression per user+deal+day).
CREATE UNIQUE INDEX "deal_interactions_user_id_dedupe_key_key"
  ON "deal_interactions"("user_id", "dedupe_key");

-- AlterTable: align the stored default radius with the product default (10 miles).
ALTER TABLE "user_preferences" ALTER COLUMN "search_radius_miles" SET DEFAULT 10;
