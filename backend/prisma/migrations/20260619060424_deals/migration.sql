-- CreateEnum
CREATE TYPE "deal_status" AS ENUM ('draft', 'published', 'archived', 'expired');

-- CreateEnum
CREATE TYPE "moderation_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "store_id" UUID,
    "category_id" UUID NOT NULL,
    "short_description" TEXT NOT NULL DEFAULT '',
    "detailed_description" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "current_price_minor" BIGINT,
    "original_price_minor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deal_score" INTEGER NOT NULL DEFAULT 50,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_student_only" BOOLEAN NOT NULL DEFAULT false,
    "coupon_code" TEXT,
    "destination_url" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    -- STORED generated geography column kept in sync with lat/lng automatically.
    "geog" geography(Point, 4326) GENERATED ALWAYS AS (
        CASE
            WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
            ELSE ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
        END
    ) STORED,
    "location_tags" TEXT[],
    "visual_seed" INTEGER NOT NULL DEFAULT 0,
    "status" "deal_status" NOT NULL DEFAULT 'published',
    "moderation_status" "moderation_status" NOT NULL DEFAULT 'approved',
    "source" TEXT NOT NULL DEFAULT 'seed',
    "start_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "deals_external_id_key" ON "deals"("external_id");

-- CreateIndex
CREATE INDEX "deals_status_expires_at_idx" ON "deals"("status", "expires_at");

-- CreateIndex
CREATE INDEX "deals_category_id_idx" ON "deals"("category_id");

-- CreateIndex (GiST spatial index for ST_DWithin / nearby queries)
CREATE INDEX "deals_geog_idx" ON "deals" USING GIST ("geog");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

