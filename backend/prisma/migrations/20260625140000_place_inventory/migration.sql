-- Local-business inventory engine. A Place is a real business discovered via
-- Google Places, separate from deals. google_place_id is the unique dedup key
-- (nullable to allow other sources later). Indexes support per-region/category
-- browsing and bounding-box geo queries.
CREATE TABLE "places" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "google_place_id" TEXT,
  "name" TEXT NOT NULL,
  "category_slug" TEXT NOT NULL,
  "google_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "address" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "price_level" INTEGER,
  "rating" DOUBLE PRECISION,
  "user_ratings_total" INTEGER,
  "website" TEXT,
  "phone" TEXT,
  "region_slug" TEXT NOT NULL,
  "campus_slug" TEXT,
  "source" TEXT NOT NULL DEFAULT 'google_places',
  "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "places_google_place_id_key" ON "places" ("google_place_id");
CREATE INDEX "places_region_slug_category_slug_idx" ON "places" ("region_slug", "category_slug");
CREATE INDEX "places_latitude_longitude_idx" ON "places" ("latitude", "longitude");
