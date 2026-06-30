-- Launch Region Data Hardening (GSU/GT). Adds Food Run decision-engine signals to
-- places (all nullable/defaulted so existing rows stay valid) and store-rec
-- coordinates so iOS can map the chosen store + optional second stop. No new tables.

ALTER TABLE "places" ADD COLUMN "late_night" boolean;
ALTER TABLE "places" ADD COLUMN "study_spot" boolean;
ALTER TABLE "places" ADD COLUMN "chain_classification" TEXT;
ALTER TABLE "places" ADD COLUMN "estimated_meal_min_minor" integer;
ALTER TABLE "places" ADD COLUMN "estimated_meal_max_minor" integer;
ALTER TABLE "places" ADD COLUMN "recommended_order" TEXT;
ALTER TABLE "places" ADD COLUMN "campus_affinity" TEXT;
ALTER TABLE "places" ADD COLUMN "launch_region_priority" integer NOT NULL DEFAULT 0;
ALTER TABLE "places" ADD COLUMN "manual_review_status" TEXT NOT NULL DEFAULT 'none';

ALTER TABLE "grocery_store_recommendations" ADD COLUMN "latitude" double precision;
ALTER TABLE "grocery_store_recommendations" ADD COLUMN "longitude" double precision;
