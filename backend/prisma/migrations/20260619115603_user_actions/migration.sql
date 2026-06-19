-- CreateEnum
CREATE TYPE "swipe_direction" AS ENUM ('left', 'right', 'up');

-- CreateEnum
CREATE TYPE "interaction_type" AS ENUM ('view', 'click', 'share');

-- CreateTable
CREATE TABLE "saved_deals" (
    "user_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_deals_pkey" PRIMARY KEY ("user_id","deal_id")
);

-- CreateTable
CREATE TABLE "watched_deals" (
    "user_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watched_deals_pkey" PRIMARY KEY ("user_id","deal_id")
);

-- CreateTable
CREATE TABLE "deal_swipes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "direction" "swipe_direction" NOT NULL,
    "was_saved_before" BOOLEAN NOT NULL DEFAULT false,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_swipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_redemptions" (
    "user_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "savings_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_redemptions_pkey" PRIMARY KEY ("user_id","deal_id")
);

-- CreateTable
CREATE TABLE "deal_interactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "type" "interaction_type" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "saved_deals_user_id_saved_at_idx" ON "saved_deals"("user_id", "saved_at");

-- CreateIndex
CREATE INDEX "watched_deals_user_id_idx" ON "watched_deals"("user_id");

-- CreateIndex
CREATE INDEX "deal_swipes_user_id_created_at_idx" ON "deal_swipes"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "deal_redemptions_user_id_created_at_idx" ON "deal_redemptions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "deal_interactions_deal_id_type_idx" ON "deal_interactions"("deal_id", "type");

-- CreateIndex
CREATE INDEX "deal_interactions_user_id_created_at_idx" ON "deal_interactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "saved_deals" ADD CONSTRAINT "saved_deals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_deals" ADD CONSTRAINT "saved_deals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watched_deals" ADD CONSTRAINT "watched_deals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watched_deals" ADD CONSTRAINT "watched_deals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_swipes" ADD CONSTRAINT "deal_swipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_swipes" ADD CONSTRAINT "deal_swipes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_redemptions" ADD CONSTRAINT "deal_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_redemptions" ADD CONSTRAINT "deal_redemptions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_interactions" ADD CONSTRAINT "deal_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_interactions" ADD CONSTRAINT "deal_interactions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

