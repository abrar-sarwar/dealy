CREATE TABLE "regional_inventories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "region_slug" TEXT NOT NULL,
  "region_name" TEXT NOT NULL,
  "region_type" TEXT NOT NULL DEFAULT 'metro',
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "radius_miles" INTEGER NOT NULL DEFAULT 10,
  "deal_count" INTEGER NOT NULL DEFAULT 0,
  "last_refresh" TIMESTAMP(3),
  "crawl_health" TEXT NOT NULL DEFAULT 'unknown',
  "verification_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "regional_inventories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "regional_inventories_region_slug_key" ON "regional_inventories"("region_slug");
CREATE INDEX "regional_inventories_region_type_idx" ON "regional_inventories"("region_type");
CREATE INDEX "regional_inventories_deal_count_last_refresh_idx" ON "regional_inventories"("deal_count", "last_refresh");

CREATE TABLE "content_hashes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_url" TEXT NOT NULL,
  "source_id" UUID,
  "hash" TEXT NOT NULL,
  "content_preview" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_hashes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_hashes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "crawl_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "content_hashes_source_url_hash_key" ON "content_hashes"("source_url", "hash");
CREATE INDEX "content_hashes_hash_idx" ON "content_hashes"("hash");
CREATE INDEX "content_hashes_source_id_idx" ON "content_hashes"("source_id");

CREATE TABLE "deal_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id" UUID,
  "source_url" TEXT NOT NULL,
  "content_hash_id" UUID,
  "regional_inventory_id" UUID,
  "title" TEXT NOT NULL,
  "merchant" TEXT NOT NULL,
  "discount" TEXT,
  "category_slug" TEXT NOT NULL,
  "expiration" TIMESTAMP(3),
  "location_text" TEXT,
  "summary" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "verification_status" "verification_status" NOT NULL DEFAULT 'pending',
  "fingerprint" TEXT,
  "raw" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_candidates_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "crawl_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "deal_candidates_content_hash_id_fkey" FOREIGN KEY ("content_hash_id") REFERENCES "content_hashes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "deal_candidates_regional_inventory_id_fkey" FOREIGN KEY ("regional_inventory_id") REFERENCES "regional_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "deal_candidates_source_id_idx" ON "deal_candidates"("source_id");
CREATE INDEX "deal_candidates_content_hash_id_idx" ON "deal_candidates"("content_hash_id");
CREATE INDEX "deal_candidates_regional_inventory_id_idx" ON "deal_candidates"("regional_inventory_id");
CREATE INDEX "deal_candidates_fingerprint_idx" ON "deal_candidates"("fingerprint");
CREATE INDEX "deal_candidates_verification_status_idx" ON "deal_candidates"("verification_status");

CREATE TABLE "ai_classifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidate_id" UUID,
  "content_hash_id" UUID,
  "task" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt_hash" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL DEFAULT 'v1',
  "output" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_classifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_classifications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "deal_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_classifications_content_hash_id_fkey" FOREIGN KEY ("content_hash_id") REFERENCES "content_hashes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ai_classifications_candidate_id_idx" ON "ai_classifications"("candidate_id");
CREATE INDEX "ai_classifications_content_hash_id_idx" ON "ai_classifications"("content_hash_id");
CREATE INDEX "ai_classifications_task_model_idx" ON "ai_classifications"("task", "model");
CREATE INDEX "ai_classifications_prompt_hash_idx" ON "ai_classifications"("prompt_hash");

CREATE TABLE "ai_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cache_key" TEXT NOT NULL,
  "task" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL DEFAULT 'v1',
  "prompt_hash" TEXT NOT NULL,
  "output" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_hit_at" TIMESTAMP(3),
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_cache_cache_key_key" ON "ai_cache"("cache_key");
CREATE INDEX "ai_cache_task_model_idx" ON "ai_cache"("task", "model");
CREATE INDEX "ai_cache_expires_at_idx" ON "ai_cache"("expires_at");

