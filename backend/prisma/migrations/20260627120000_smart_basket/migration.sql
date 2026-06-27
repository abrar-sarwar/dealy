-- Smart Basket (Grocery Autopilot): deterministic staples catalog + generated
-- baskets, store recommendations, and matched real-deal records. No existing
-- tables are changed. Money is stored in minor units (cents).

-- CreateTable
CREATE TABLE "grocery_staple_items" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "default_quantity" INTEGER NOT NULL DEFAULT 1,
    "estimated_price_minor" INTEGER NOT NULL,
    "dietary_tags" TEXT[],
    "goal_affinities" TEXT[],
    "prep_level" TEXT NOT NULL DEFAULT 'low',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_staple_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_baskets" (
    "id" UUID NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "budget_minor" INTEGER NOT NULL,
    "timeframe" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "region_slug" TEXT,
    "campus_slug" TEXT,
    "estimated_total_minor" INTEGER NOT NULL,
    "estimated_savings_minor" INTEGER NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "explanation" TEXT NOT NULL DEFAULT '',
    "source_status" TEXT NOT NULL DEFAULT 'estimated',
    "route_summary" TEXT,
    "dietary_prefs" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_baskets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_basket_items" (
    "id" UUID NOT NULL,
    "basket_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "staple_slug" TEXT,
    "category" TEXT NOT NULL,
    "estimated_price_minor" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL,
    "store_name" TEXT,
    "matched_deal_id" UUID,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "trust_label" TEXT NOT NULL DEFAULT 'estimated',
    "substitutions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_basket_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_store_recommendations" (
    "id" UUID NOT NULL,
    "basket_id" UUID NOT NULL,
    "store_name" TEXT NOT NULL,
    "place_id" UUID,
    "kind" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_total_minor" INTEGER NOT NULL,
    "estimated_savings_minor" INTEGER NOT NULL DEFAULT 0,
    "distance_miles" DOUBLE PRECISION,
    "reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_store_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_deal_matches" (
    "id" UUID NOT NULL,
    "basket_item_id" UUID NOT NULL,
    "deal_id" UUID,
    "merchant" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discount" TEXT,
    "price_minor" INTEGER NOT NULL,
    "valid_until" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT '',
    "last_verified_at" TIMESTAMP(3),
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_deal_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_basket_saves" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "basket_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_basket_saves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grocery_staple_items_slug_key" ON "grocery_staple_items"("slug");

-- CreateIndex
CREATE INDEX "grocery_staple_items_category_idx" ON "grocery_staple_items"("category");

-- CreateIndex
CREATE INDEX "grocery_baskets_user_id_created_at_idx" ON "grocery_baskets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "grocery_basket_items_basket_id_idx" ON "grocery_basket_items"("basket_id");

-- CreateIndex
CREATE INDEX "grocery_store_recommendations_basket_id_idx" ON "grocery_store_recommendations"("basket_id");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_deal_matches_basket_item_id_key" ON "grocery_deal_matches"("basket_item_id");

-- CreateIndex
CREATE INDEX "grocery_deal_matches_deal_id_idx" ON "grocery_deal_matches"("deal_id");

-- CreateIndex
CREATE INDEX "user_basket_saves_user_id_idx" ON "user_basket_saves"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_basket_saves_user_id_basket_id_key" ON "user_basket_saves"("user_id", "basket_id");

-- AddForeignKey
ALTER TABLE "grocery_basket_items" ADD CONSTRAINT "grocery_basket_items_basket_id_fkey" FOREIGN KEY ("basket_id") REFERENCES "grocery_baskets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_store_recommendations" ADD CONSTRAINT "grocery_store_recommendations_basket_id_fkey" FOREIGN KEY ("basket_id") REFERENCES "grocery_baskets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_deal_matches" ADD CONSTRAINT "grocery_deal_matches_basket_item_id_fkey" FOREIGN KEY ("basket_item_id") REFERENCES "grocery_basket_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_basket_saves" ADD CONSTRAINT "user_basket_saves_basket_id_fkey" FOREIGN KEY ("basket_id") REFERENCES "grocery_baskets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
