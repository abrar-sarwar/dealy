-- CreateTable
CREATE TABLE "coverage_zones" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius_miles" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coverage_zones_slug_key" ON "coverage_zones"("slug");

-- CreateIndex
CREATE INDEX "coverage_zones_enabled_idx" ON "coverage_zones"("enabled");

-- Seed the densest Atlanta core zones (enabled). They only actually serve Nearby
-- once they reach the >=20 authoritative-verified threshold, computed live.
INSERT INTO "coverage_zones" ("id", "slug", "name", "latitude", "longitude", "radius_miles", "enabled")
VALUES
  (gen_random_uuid(), 'atl-downtown', 'Downtown Atlanta', 33.755, -84.39, 10, true),
  (gen_random_uuid(), 'atl-midtown', 'Midtown Atlanta', 33.781, -84.383, 10, true)
ON CONFLICT ("slug") DO NOTHING;
