-- Add image_url column to deal_candidates and deals tables.
-- Captures the Open Graph image URL scraped from Firecrawl metadata.
ALTER TABLE "deal_candidates" ADD COLUMN "image_url" TEXT;
ALTER TABLE "deals" ADD COLUMN "image_url" TEXT;
