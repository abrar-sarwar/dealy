-- Gemini-generated "what to order / how to save here for your budget" tip on each
-- enriched place. Nullable; populated by the P3 place-enrichment pipeline.
ALTER TABLE "places" ADD COLUMN "budget_tip" TEXT;
