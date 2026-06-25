-- Migration: campus_student_lane
-- Adds campus_slug and requires_student_id to deal_candidates and deals tables.
ALTER TABLE "deal_candidates" ADD COLUMN "campus_slug" TEXT;
ALTER TABLE "deal_candidates" ADD COLUMN "requires_student_id" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "deals" ADD COLUMN "campus_slug" TEXT;
ALTER TABLE "deals" ADD COLUMN "requires_student_id" BOOLEAN NOT NULL DEFAULT false;
