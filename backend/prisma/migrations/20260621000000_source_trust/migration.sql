-- CreateEnum
CREATE TYPE "source_trust" AS ENUM ('authoritative', 'editorial', 'fixture');

-- AlterTable: default 'fixture' is the SAFE non-authoritative default — an
-- unknown source is never treated as source-confirmed.
ALTER TABLE "deals" ADD COLUMN "source_trust" "source_trust" NOT NULL DEFAULT 'fixture';

-- Backfill provenance trust from known source providers. Only real, re-verifiable
-- providers are authoritative; curated editorial and seed/fixture are not.
UPDATE "deals" SET "source_trust" = 'authoritative' WHERE "source" IN ('ticketmaster');
UPDATE "deals" SET "source_trust" = 'editorial' WHERE "source" IN ('editorial');
-- Everything else (seed, fixture, unknown) remains 'fixture'.

-- CORRECTIVE backfill: the prior verification migration (20260620222212) marked
-- EVERY published, non-expired deal verified. That conflated dev/fixture and
-- editorial inventory with source-confirmed inventory. Reset all non-authoritative
-- deals back to `pending` so a Verified status reflects real source confirmation
-- only. Authoritative deals (e.g. Ticketmaster) keep verified; the daily job
-- re-confirms them.
UPDATE "deals"
SET "verification_status" = 'pending',
    "last_verified_at" = NULL,
    "last_verification_attempt_at" = NULL,
    "verification_failure_reason" = NULL
WHERE "source_trust" <> 'authoritative'
  AND "verification_status" = 'verified';

-- Index for trust-gated feed/coverage reads.
CREATE INDEX "deals_source_trust_verification_status_idx" ON "deals"("source_trust", "verification_status");
