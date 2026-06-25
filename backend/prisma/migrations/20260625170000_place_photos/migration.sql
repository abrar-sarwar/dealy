-- Real Google Places photos on places. All keyless, client-loadable URLs are
-- resolved server-side (the API key never reaches the client) by a capped batch
-- job — never live-fetched on app open. See docs/places-photos.md.
ALTER TABLE "places" ADD COLUMN "primary_photo_reference" TEXT;
ALTER TABLE "places" ADD COLUMN "primary_photo_url" TEXT;
ALTER TABLE "places" ADD COLUMN "photo_attribution" TEXT;
ALTER TABLE "places" ADD COLUMN "photo_source" TEXT;
ALTER TABLE "places" ADD COLUMN "photo_fetched_at" TIMESTAMP(3);
ALTER TABLE "places" ADD COLUMN "image_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "places" ADD COLUMN "logo_url" TEXT;

CREATE INDEX "places_image_status_idx" ON "places"("image_status");
