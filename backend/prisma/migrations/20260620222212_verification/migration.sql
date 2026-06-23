-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('pending', 'verified', 'unreachable', 'invalid', 'expired');

-- AlterTable
-- NOTE: Prisma's diff wants to `DROP INDEX "deals_geog_idx"` and
-- `ALTER COLUMN "geog" DROP DEFAULT` here because the PostGIS generated `geog`
-- column + GiST index are managed by raw SQL (ADR-003) and aren't representable
-- in schema.prisma. Those statements are intentionally removed — dropping them
-- would destroy the spatial index every nearby query depends on.
ALTER TABLE "deals" ADD COLUMN     "last_verification_attempt_at" TIMESTAMP(3),
ADD COLUMN     "last_verified_at" TIMESTAMP(3),
ADD COLUMN     "provider_attribution" TEXT,
ADD COLUMN     "source_url" TEXT,
ADD COLUMN     "verification_failure_reason" TEXT,
ADD COLUMN     "verification_status" "verification_status" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "verification_runs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ingestion_status" NOT NULL DEFAULT 'running',
    "checked" INTEGER NOT NULL DEFAULT 0,
    "confirmed" INTEGER NOT NULL DEFAULT 0,
    "invalidated" INTEGER NOT NULL DEFAULT 0,
    "expired" INTEGER NOT NULL DEFAULT 0,
    "unreachable" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "verification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_outcomes" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "deal_id" UUID,
    "external_id" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_runs_provider_started_at_idx" ON "verification_runs"("provider", "started_at");

-- CreateIndex
CREATE INDEX "verification_outcomes_run_id_idx" ON "verification_outcomes"("run_id");

-- CreateIndex
CREATE INDEX "deals_status_verification_status_expires_at_idx" ON "deals"("status", "verification_status", "expires_at");

-- CreateIndex
CREATE INDEX "deals_verification_status_expires_at_idx" ON "deals"("verification_status", "expires_at");

-- AddForeignKey
ALTER TABLE "verification_outcomes" ADD CONSTRAINT "verification_outcomes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "verification_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing published, non-expired deals predate the verification
-- pipeline. Treat them as verified-at-migration-time so the pilot has inventory
-- and the running feeds aren't emptied; the daily job will re-confirm them.
UPDATE "deals"
SET "verification_status" = 'verified',
    "last_verified_at" = CURRENT_TIMESTAMP
WHERE "status" = 'published' AND "expires_at" > CURRENT_TIMESTAMP;
