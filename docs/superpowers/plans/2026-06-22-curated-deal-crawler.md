# Curated Deal Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crawl public deal sources, extract + normalize candidates, queue them for moderation as CURATED inventory, and serve a never-empty, trust-tiered (VERIFIED > CURATED > ONLINE > COMMUNITY) Nearby feed.

**Architecture:** A new `src/crawler/` subsystem mirrors `src/ingestion/`: fetch → hybrid extract (structured-first, Claude fallback) → geocode → normalize → upsert as `draft`/`pending` editorial deals. Moderation lives in `src/admin/`. `feed_tier` is **derived** (never stored) from `(source_trust, verification_status, moderation_status, is_online)` via one shared helper mirrored as SQL `CASE`. `FeedsService.nearby()` gains a graded fallback ladder that blends down the tiers and expands radius before ever returning empty, while preserving the existing `coverage` signal and authoritative-only "Verified" badge.

**Tech Stack:** NestJS + Fastify, Prisma + PostGIS, TypeScript, Jest, Zod (env), Anthropic SDK (`@anthropic-ai/sdk`) for the LLM fallback extractor, Meilisearch (existing search indexer).

## Global Constraints

- **Money is integer minor units (cents)** — `bigint`, never floating-point on storage.
- **"Verified" badge = `source_trust='authoritative'` + `verification_status='verified'` ONLY.** The crawler never touches verification/coverage paths.
- **Crawled deals default to `status='draft'` + `moderation_status='pending'`** — never served until approved (feed queries require `status='published'`).
- **`feed_tier` is derived, NOT stored.** No Prisma enum/column/backfill for it.
- **Migrations:** hand-author via `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script` then `prisma migrate deploy`. NEVER `migrate dev` (destructive-reset prompt fights the PostGIS image).
- **Provider trust enum stays `authoritative | editorial | fixture`.** The crawler is `editorial`-trust.
- **Tests need Docker (colima):** `colima start && pnpm db:up` before DB-backed tests. Pure-logic tests need no DB.
- **`jose` pinned to v5** (do not bump). Follow existing file layout: one responsibility per file, `*.spec.ts` beside source.
- **Latest Claude model** for the LLM extractor: `claude-opus-4-8` (configurable).
- Run all backend commands from `backend/` (`cd backend && pnpm …`).

---

## File Structure

**Phase 1 — data model**
- Create `src/feeds/feed-tier.ts` — `FeedTier` type, `deriveFeedTier()`, `feedTierRank()`, `FEED_TIER_CASE_SQL`.
- Create `src/feeds/feed-tier.spec.ts`.
- Modify `prisma/schema.prisma` — `CrawlKind` enum; `Deal.confidenceScore`, `Deal.crawlSourceId` + relation + curated index; `CrawlSource`, `CrawlRun`, `CrawlFailure` models.
- Create `prisma/migrations/<ts>_curated_crawler/migration.sql`.
- Modify `src/config/env.schema.ts` — `GEOCODER_KEY`, `CRAWLER_AUTOPUBLISH_THRESHOLD`, `CRAWLER_AUTOPUBLISH_KINDS`.
- Modify `src/config/env.schema.spec.ts`.
- Modify `src/deals/deal.dto.ts` — `DealDto.trustLevel`, `DealDto.confidenceScore`.
- Modify `src/deals/deal.mapper.ts` — populate the two new DTO fields.
- Modify `src/deals/deal.mapper.spec.ts` (create if absent).

**Phase 2 — crawler + extraction**
- Create `src/crawler/deal-candidate.ts` — `DealCandidate`, `confidenceScore()`.
- Create `src/crawler/deal-candidate.spec.ts`.
- Create `src/crawler/extractors/deal-extractor.ts` — `DealExtractor` interface, `ExtractionResult`.
- Create `src/crawler/extractors/structured-extractor.ts` + `.spec.ts`.
- Create `src/crawler/extractors/llm-extractor.ts` + `.spec.ts`.
- Create `src/crawler/geocoding/geocoder.ts` — `Geocoder` interface + `GeocodeResult`.
- Create `src/crawler/geocoding/nominatim-geocoder.ts` + `.spec.ts`.
- Create `src/crawler/geocoding/mapbox-geocoder.ts`.
- Create `src/crawler/geocoding/geocoder.provider.ts` — DI factory selecting impl by `GEOCODER_KEY`.
- Create `src/crawler/source-fetcher.ts` + `.spec.ts`.
- Create `src/crawler/crawler.service.ts` + `.spec.ts`.
- Create `src/crawler/crawler.module.ts`.
- Create `src/crawler/crawl-cli.ts`.
- Modify `src/app.module.ts` — register `CrawlerModule`.
- Modify `backend/package.json` — `"crawl"` script; add `@anthropic-ai/sdk` dep.

**Phase 3 — moderation**
- Create `src/admin/moderation.service.ts` + `.spec.ts`.
- Create `src/admin/moderation.dto.ts`.
- Modify `src/admin/admin.controller.ts` — queue/approve/reject/edit endpoints.
- Modify `src/admin/admin.module.ts` — provide `ModerationService`.

**Phase 4 — feed blending**
- Modify `src/feeds/feeds.service.ts` — blend ladder + composite cursor.
- Modify `src/feeds/feeds.service.spec.ts` (create if absent).
- Modify `src/deals/deal.dto.ts` — `NearbyDealPage.blend` signal.

---

## PHASE 1 — DATA MODEL

### Task 1.1: Feed-tier derivation helper (pure logic)

**Files:**
- Create: `src/feeds/feed-tier.ts`
- Test: `src/feeds/feed-tier.spec.ts`

**Interfaces:**
- Produces: `type FeedTier = 'verified' | 'curated' | 'online' | 'community'`;
  `deriveFeedTier(input: { sourceTrust: string; verificationStatus: string; moderationStatus: string; status: string; isOnline: boolean }): FeedTier`;
  `feedTierRank(tier: FeedTier): 0 | 1 | 2 | 3`;
  `FEED_TIER_CASE_SQL: string` (SQL expression returning the same 0–3 rank, referencing columns `d.source_trust, d.verification_status, d.moderation_status, d.is_online`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/feeds/feed-tier.spec.ts
import { deriveFeedTier, feedTierRank } from './feed-tier';

const base = {
  sourceTrust: 'authoritative',
  verificationStatus: 'verified',
  moderationStatus: 'approved',
  status: 'published',
  isOnline: false,
};

describe('deriveFeedTier', () => {
  it('authoritative + verified + physical → verified', () => {
    expect(deriveFeedTier(base)).toBe('verified');
  });
  it('authoritative + verified + online → online', () => {
    expect(deriveFeedTier({ ...base, isOnline: true })).toBe('online');
  });
  it('editorial + approved + published → curated', () => {
    expect(
      deriveFeedTier({ ...base, sourceTrust: 'editorial', verificationStatus: 'pending' }),
    ).toBe('curated');
  });
  it('editorial pending moderation → community (reserved fallback)', () => {
    expect(
      deriveFeedTier({
        ...base,
        sourceTrust: 'editorial',
        verificationStatus: 'pending',
        moderationStatus: 'pending',
        status: 'draft',
      }),
    ).toBe('community');
  });
  it('unverified authoritative → community', () => {
    expect(deriveFeedTier({ ...base, verificationStatus: 'pending' })).toBe('community');
  });
});

describe('feedTierRank', () => {
  it('orders verified < curated < online < community', () => {
    expect(feedTierRank('verified')).toBe(0);
    expect(feedTierRank('curated')).toBe(1);
    expect(feedTierRank('online')).toBe(2);
    expect(feedTierRank('community')).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm jest src/feeds/feed-tier.spec.ts`
Expected: FAIL — `Cannot find module './feed-tier'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/feeds/feed-tier.ts
/**
 * Public trust tier surfaced to clients and used for feed ranking. DERIVED, never
 * stored — computed from provenance + verification + moderation so it can never
 * drift out of sync. Mirrored as SQL in FEED_TIER_CASE_SQL for feed ordering.
 *
 * Rank: verified(0) < curated(1) < online(2) < community(3).
 * "Verified" stays authoritative-only. COMMUNITY is the reserved fallback bucket
 * (no ingest path yet); anything not matching a real tier lands here.
 */
export type FeedTier = 'verified' | 'curated' | 'online' | 'community';

export interface FeedTierInput {
  sourceTrust: string;
  verificationStatus: string;
  moderationStatus: string;
  status: string;
  isOnline: boolean;
}

export function deriveFeedTier(d: FeedTierInput): FeedTier {
  const verified = d.verificationStatus === 'verified';
  if (d.sourceTrust === 'authoritative' && verified) {
    return d.isOnline ? 'online' : 'verified';
  }
  if (
    d.sourceTrust === 'editorial' &&
    d.moderationStatus === 'approved' &&
    d.status === 'published'
  ) {
    return 'curated';
  }
  return 'community';
}

const RANK: Record<FeedTier, 0 | 1 | 2 | 3> = {
  verified: 0,
  curated: 1,
  online: 2,
  community: 3,
};

export function feedTierRank(tier: FeedTier): 0 | 1 | 2 | 3 {
  return RANK[tier];
}

/**
 * SQL expression yielding the same 0–3 rank as feedTierRank(deriveFeedTier(...)).
 * Inline-able into ORDER BY / SELECT. Assumes the `deals` table aliased as `d`.
 */
export const FEED_TIER_CASE_SQL = `
  CASE
    WHEN d.source_trust = 'authoritative' AND d.verification_status = 'verified' AND d.is_online = false THEN 0
    WHEN d.source_trust = 'editorial' AND d.moderation_status = 'approved' AND d.status = 'published' THEN 1
    WHEN d.source_trust = 'authoritative' AND d.verification_status = 'verified' AND d.is_online = true THEN 2
    ELSE 3
  END`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm jest src/feeds/feed-tier.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/feeds/feed-tier.ts backend/src/feeds/feed-tier.spec.ts
git commit -m "feat(backend): derived feed-tier helper (verified>curated>online>community)"
```

---

### Task 1.2: Prisma schema + migration (crawl tables, deal columns)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_curated_crawler/migration.sql`
- Test: `src/crawler/crawl-model.spec.ts` (DB-backed smoke test)

**Interfaces:**
- Produces: Prisma models `CrawlSource`, `CrawlRun`, `CrawlFailure`; enum `CrawlKind`; `Deal.confidenceScore: number | null`, `Deal.crawlSourceId: string | null`.

- [ ] **Step 1: Add the schema changes**

In `prisma/schema.prisma`, add the enum and models, and extend `Deal`:

```prisma
enum CrawlKind {
  restaurant
  happy_hour
  student_discount
  grocery_circular
  local_promo

  @@map("crawl_kind")
}

model CrawlSource {
  id                  String     @id @default(uuid()) @db.Uuid
  url                 String     @unique
  kind                CrawlKind
  merchantHint        String?    @map("merchant_hint")
  defaultCategorySlug String?    @map("default_category_slug")
  zoneSlug            String?    @map("zone_slug")
  enabled             Boolean    @default(true)
  crawlIntervalHours  Int        @default(24) @map("crawl_interval_hours")
  lastCrawledAt       DateTime?  @map("last_crawled_at")
  createdAt           DateTime   @default(now()) @map("created_at")

  deals Deal[]
  runs  CrawlRun[]

  @@index([enabled])
  @@map("crawl_sources")
}

model CrawlRun {
  id         String          @id @default(uuid()) @db.Uuid
  sourceId   String          @map("source_id") @db.Uuid
  status     IngestionStatus @default(running)
  fetched    Int             @default(0)
  queued     Int             @default(0)
  deduped    Int             @default(0)
  failed     Int             @default(0)
  error      String?
  startedAt  DateTime        @default(now()) @map("started_at")
  finishedAt DateTime?       @map("finished_at")

  source   CrawlSource    @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  failures CrawlFailure[]

  @@index([sourceId, startedAt])
  @@map("crawl_runs")
}

model CrawlFailure {
  id        String   @id @default(uuid()) @db.Uuid
  runId     String   @map("run_id") @db.Uuid
  url       String?
  reason    String
  createdAt DateTime @default(now()) @map("created_at")

  run CrawlRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@map("crawl_failures")
}
```

In `model Deal`, add these fields (next to `fingerprint`) and the relation + index:

```prisma
  confidenceScore     Int?             @map("confidence_score")
  crawlSourceId       String?          @map("crawl_source_id") @db.Uuid
  crawlSource         CrawlSource?     @relation(fields: [crawlSourceId], references: [id], onDelete: SetNull)
```

And add to the existing `@@index(...)` block for `Deal`:

```prisma
  // Curated-in-radius feed read (editorial + approved + published).
  @@index([status, moderationStatus, expiresAt])
```

- [ ] **Step 2: Generate the migration SQL (hand-authored convention)**

Run (from `backend/`), with the DB up (`colima start && pnpm db:up`):

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_curated_crawler
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/curated_crawler.sql
```

If `migrate diff` cannot reach a shadow DB, hand-write `migration.sql` with this content (the expected DDL):

```sql
-- migration.sql
CREATE TYPE "crawl_kind" AS ENUM ('restaurant', 'happy_hour', 'student_discount', 'grocery_circular', 'local_promo');

CREATE TABLE "crawl_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "url" TEXT NOT NULL,
  "kind" "crawl_kind" NOT NULL,
  "merchant_hint" TEXT,
  "default_category_slug" TEXT,
  "zone_slug" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "crawl_interval_hours" INTEGER NOT NULL DEFAULT 24,
  "last_crawled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crawl_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crawl_sources_url_key" ON "crawl_sources"("url");
CREATE INDEX "crawl_sources_enabled_idx" ON "crawl_sources"("enabled");

CREATE TABLE "crawl_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id" UUID NOT NULL,
  "status" "ingestion_status" NOT NULL DEFAULT 'running',
  "fetched" INTEGER NOT NULL DEFAULT 0,
  "queued" INTEGER NOT NULL DEFAULT 0,
  "deduped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "crawl_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crawl_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "crawl_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "crawl_runs_source_id_started_at_idx" ON "crawl_runs"("source_id", "started_at");

CREATE TABLE "crawl_failures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "url" TEXT,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crawl_failures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crawl_failures_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "crawl_failures_run_id_idx" ON "crawl_failures"("run_id");

ALTER TABLE "deals" ADD COLUMN "confidence_score" INTEGER;
ALTER TABLE "deals" ADD COLUMN "crawl_source_id" UUID;
ALTER TABLE "deals" ADD CONSTRAINT "deals_crawl_source_id_fkey" FOREIGN KEY ("crawl_source_id") REFERENCES "crawl_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "deals_status_moderation_status_expires_at_idx" ON "deals"("status", "moderation_status", "expires_at");
```

> The existing `ingestion_status` enum is reused for `crawl_runs.status` — confirm its name with `\dT` in psql; it is mapped from `enum IngestionStatus`.

- [ ] **Step 3: Apply the migration + regenerate the client**

```bash
cd backend && pnpm prisma migrate deploy && pnpm prisma generate
```
Expected: migration applied, client regenerated with `crawlSource` etc.

- [ ] **Step 4: Write a DB-backed smoke test**

```typescript
// src/crawler/crawl-model.spec.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => prisma.$disconnect());

describe('crawler schema', () => {
  it('creates a source, run, failure, and a draft curated deal', async () => {
    const source = await prisma.crawlSource.create({
      data: { url: `https://example.test/${Date.now()}`, kind: 'restaurant' },
    });
    const run = await prisma.crawlRun.create({ data: { sourceId: source.id } });
    await prisma.crawlFailure.create({ data: { runId: run.id, reason: 'timeout' } });

    const category = await prisma.category.findFirstOrThrow();
    const deal = await prisma.deal.create({
      data: {
        externalId: `crawl-test-${Date.now()}`,
        title: 'Half-price tacos',
        merchant: 'Test Cantina',
        categoryId: category.id,
        status: 'draft',
        moderationStatus: 'pending',
        sourceTrust: 'editorial',
        confidenceScore: 82,
        crawlSourceId: source.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(deal.confidenceScore).toBe(82);
    expect(deal.crawlSourceId).toBe(source.id);

    await prisma.deal.delete({ where: { id: deal.id } });
    await prisma.crawlSource.delete({ where: { id: source.id } }); // cascades run+failure
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd backend && pnpm jest src/crawler/crawl-model.spec.ts`
Expected: PASS (requires colima DB up).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/crawler/crawl-model.spec.ts
git commit -m "feat(backend): crawl tables + deal crawler columns (migration)"
```

---

### Task 1.3: Env config for geocoder + auto-publish

**Files:**
- Modify: `src/config/env.schema.ts`
- Test: `src/config/env.schema.spec.ts`

**Interfaces:**
- Produces env keys: `GEOCODER_KEY?: string`, `CRAWLER_AUTOPUBLISH_THRESHOLD?: number` (1–100), `CRAWLER_AUTOPUBLISH_KINDS: string` (CSV, default `''`); helper `autoPublishKinds(env): string[]`.

- [ ] **Step 1: Write the failing test**

```typescript
// add to src/config/env.schema.spec.ts
import { envSchema, autoPublishKinds } from './env.schema';

describe('crawler env', () => {
  const base = { DATABASE_URL: 'postgres://x' };
  it('defaults auto-publish off and kinds empty', () => {
    const env = envSchema.parse(base);
    expect(env.CRAWLER_AUTOPUBLISH_THRESHOLD).toBeUndefined();
    expect(autoPublishKinds(env)).toEqual([]);
  });
  it('parses threshold and kinds csv', () => {
    const env = envSchema.parse({
      ...base,
      CRAWLER_AUTOPUBLISH_THRESHOLD: '90',
      CRAWLER_AUTOPUBLISH_KINDS: 'grocery_circular, restaurant',
    });
    expect(env.CRAWLER_AUTOPUBLISH_THRESHOLD).toBe(90);
    expect(autoPublishKinds(env)).toEqual(['grocery_circular', 'restaurant']);
  });
  it('rejects an out-of-range threshold', () => {
    expect(() => envSchema.parse({ ...base, CRAWLER_AUTOPUBLISH_THRESHOLD: '150' })).toThrow();
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `cd backend && pnpm jest src/config/env.schema.spec.ts -t crawler`
Expected: FAIL — `autoPublishKinds` undefined / unknown keys.

- [ ] **Step 3: Implement**

In `src/config/env.schema.ts`, add inside the `z.object({...})` (next to `TICKETMASTER_API_KEY`):

```typescript
    // Crawler / curated pipeline.
    GEOCODER_KEY: optionalString,
    CRAWLER_AUTOPUBLISH_THRESHOLD: z.coerce.number().int().min(1).max(100).optional(),
    CRAWLER_AUTOPUBLISH_KINDS: z.string().default(''),
```

After `fixturesEnabled(...)`, add:

```typescript
/** Parsed CrawlKind allowlist for auto-publish. Empty = no kind is auto-published. */
export function autoPublishKinds(env: Pick<Env, 'CRAWLER_AUTOPUBLISH_KINDS'>): string[] {
  return env.CRAWLER_AUTOPUBLISH_KINDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Run it (passes)**

Run: `cd backend && pnpm jest src/config/env.schema.spec.ts -t crawler`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/env.schema.ts backend/src/config/env.schema.spec.ts
git commit -m "feat(backend): env for geocoder key + crawler auto-publish thresholds"
```

---

### Task 1.4: Surface trustLevel + confidenceScore on DealDto

**Files:**
- Modify: `src/deals/deal.dto.ts`, `src/deals/deal.mapper.ts`
- Test: `src/deals/deal.mapper.spec.ts` (create)

**Interfaces:**
- Consumes: `deriveFeedTier` (Task 1.1).
- Produces: `DealDto.trustLevel: FeedTier`, `DealDto.confidenceScore: number | null`. The mapper's internal `NormalizedDeal` gains `sourceTrust`, `moderationStatus`, `status`, `confidenceScore`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/deals/deal.mapper.spec.ts
import { mapPrismaDeal } from './deal.mapper';

function fakeDeal(over: Partial<any> = {}) {
  return {
    id: 'd1', title: 't', merchant: 'm',
    category: { slug: 'food' },
    shortDescription: '', detailedDescription: '', terms: '',
    currentPriceMinor: 500n, originalPriceMinor: 1000n, currency: 'USD',
    dealScore: 50, isOnline: false, isStudentOnly: false,
    couponCode: null, destinationUrl: null, latitude: 33.7, longitude: -84.4,
    locationTags: [], visualSeed: 0,
    verificationStatus: 'verified', lastVerifiedAt: new Date(), createdAt: new Date(),
    startAt: null, expiresAt: new Date(Date.now() + 1000),
    sourceTrust: 'authoritative', moderationStatus: 'approved', status: 'published',
    confidenceScore: null, ...over,
  };
}

describe('mapPrismaDeal trust fields', () => {
  it('authoritative verified physical → trustLevel verified', () => {
    expect(mapPrismaDeal(fakeDeal() as any, null).trustLevel).toBe('verified');
  });
  it('editorial approved published → curated, carries confidenceScore', () => {
    const dto = mapPrismaDeal(
      fakeDeal({ sourceTrust: 'editorial', verificationStatus: 'pending', confidenceScore: 77 }) as any,
      null,
    );
    expect(dto.trustLevel).toBe('curated');
    expect(dto.confidenceScore).toBe(77);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `cd backend && pnpm jest src/deals/deal.mapper.spec.ts`
Expected: FAIL — `trustLevel` undefined.

- [ ] **Step 3: Implement**

In `deal.dto.ts`, import the type and add two fields to `DealDto`:

```typescript
import type { FeedTier } from '../feeds/feed-tier';
// …inside interface DealDto, after `verifiedAt`:
  /** Derived display/ranking tier (verified|curated|online|community). */
  trustLevel: FeedTier;
  /** Crawler confidence (0–100) for curated deals; null otherwise. */
  confidenceScore: number | null;
```

In `deal.mapper.ts`:
- Add `import { deriveFeedTier } from '../feeds/feed-tier';`
- Extend the internal `NormalizedDeal` interface with:
  `sourceTrust: string; moderationStatus: string; status: string; confidenceScore: number | null;`
- In `toDealDto`, add to the returned object:
  ```typescript
    trustLevel: deriveFeedTier({
      sourceTrust: n.sourceTrust,
      verificationStatus: n.verificationStatus,
      moderationStatus: n.moderationStatus,
      status: n.status,
      isOnline: n.isOnline,
    }),
    confidenceScore: n.confidenceScore,
  ```
- In `mapPrismaDeal`, pass the new fields from `deal`: `sourceTrust: deal.sourceTrust, moderationStatus: deal.moderationStatus, status: deal.status, confidenceScore: deal.confidenceScore`.
- In `NearbyRow` add columns `source_trust: string; moderation_status: string; status: string; confidence_score: number | null;` and in `mapNearbyRow` pass them through. (The nearby SQL in Phase 4 will `SELECT` these.)

- [ ] **Step 4: Run it (passes)**

Run: `cd backend && pnpm jest src/deals/deal.mapper.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/deals/deal.dto.ts backend/src/deals/deal.mapper.ts backend/src/deals/deal.mapper.spec.ts
git commit -m "feat(backend): expose derived trustLevel + confidenceScore on DealDto"
```

---

## PHASE 2 — CRAWLER + EXTRACTION

### Task 2.1: DealCandidate + confidenceScore (pure logic)

**Files:**
- Create: `src/crawler/deal-candidate.ts`, `src/crawler/deal-candidate.spec.ts`

**Interfaces:**
- Produces: `interface DealCandidate { title; merchant; categorySlug; address; latitude; longitude; startAt; expiresAt; sourceUrl; currentPriceMinor; couponCode; isStudentOnly; extractionPath: 'structured' | 'llm'; geocodeConfidence: number; }`;
  `confidenceScore(c: DealCandidate): number` (0–100);
  `LOW_GEOCODE_CONFIDENCE = 0.5`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/crawler/deal-candidate.spec.ts
import { confidenceScore, type DealCandidate } from './deal-candidate';

function candidate(over: Partial<DealCandidate> = {}): DealCandidate {
  return {
    title: 'Happy Hour', merchant: 'The Pub', categorySlug: 'food',
    address: '123 Peachtree St, Atlanta, GA', latitude: 33.75, longitude: -84.39,
    startAt: new Date(Date.now() + 1000), expiresAt: new Date(Date.now() + 86_400_000),
    sourceUrl: 'https://pub.test/specials', currentPriceMinor: 500n,
    couponCode: null, isStudentOnly: false,
    extractionPath: 'structured', geocodeConfidence: 0.9, ...over,
  };
}

describe('confidenceScore', () => {
  it('full structured candidate scores high', () => {
    expect(confidenceScore(candidate())).toBeGreaterThanOrEqual(85);
  });
  it('llm path scores below an equivalent structured one', () => {
    expect(confidenceScore(candidate({ extractionPath: 'llm' })))
      .toBeLessThan(confidenceScore(candidate()));
  });
  it('missing fields lower the score', () => {
    expect(confidenceScore(candidate({ merchant: '', address: '' })))
      .toBeLessThan(confidenceScore(candidate()));
  });
  it('clamps to 0–100', () => {
    const s = confidenceScore(candidate({ geocodeConfidence: 0 }));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest src/crawler/deal-candidate.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```typescript
// src/crawler/deal-candidate.ts
export const LOW_GEOCODE_CONFIDENCE = 0.5;

export interface DealCandidate {
  title: string;
  merchant: string;
  categorySlug: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  startAt: Date | null;
  expiresAt: Date | null;
  sourceUrl: string;
  currentPriceMinor: bigint | null;
  couponCode: string | null;
  isStudentOnly: boolean;
  extractionPath: 'structured' | 'llm';
  geocodeConfidence: number; // 0–1
}

/**
 * Composite 0–100 confidence. Weighted: extraction path (structured beats llm),
 * required-field completeness, geocode confidence, and date validity. Pure +
 * deterministic so moderators get a stable triage signal.
 */
export function confidenceScore(c: DealCandidate): number {
  const pathScore = c.extractionPath === 'structured' ? 30 : 18;

  const required = [c.title, c.merchant, c.categorySlug, c.address];
  const present = required.filter((v) => v.trim().length > 0).length;
  const completeness = (present / required.length) * 30;

  const geo = Math.max(0, Math.min(1, c.geocodeConfidence)) * 25;

  const datesValid =
    c.expiresAt !== null &&
    c.expiresAt.getTime() > Date.now() &&
    (c.startAt === null || c.startAt.getTime() < c.expiresAt.getTime());
  const dateScore = datesValid ? 15 : 0;

  return Math.round(Math.max(0, Math.min(100, pathScore + completeness + geo + dateScore)));
}
```

- [ ] **Step 4: Run it (passes)** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/crawler/deal-candidate.ts backend/src/crawler/deal-candidate.spec.ts
git commit -m "feat(backend): DealCandidate + confidence scoring"
```

---

### Task 2.2: StructuredExtractor (JSON-LD / microdata / regex)

**Files:**
- Create: `src/crawler/extractors/deal-extractor.ts`, `src/crawler/extractors/structured-extractor.ts`, `src/crawler/extractors/structured-extractor.spec.ts`

**Interfaces:**
- Produces: `interface ExtractionResult { candidates: Omit<DealCandidate,'latitude'|'longitude'|'geocodeConfidence'>[] }`;
  `interface DealExtractor { extract(html: string, ctx: ExtractContext): Promise<ExtractionResult> }`;
  `interface ExtractContext { url: string; merchantHint?: string; defaultCategorySlug?: string }`;
  class `StructuredExtractor implements DealExtractor` (readonly `path = 'structured'`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/crawler/extractors/structured-extractor.spec.ts
import { StructuredExtractor } from './structured-extractor';

const JSONLD = `<html><head><script type="application/ld+json">
{"@type":"FoodEstablishment","name":"Taco Spot","address":"1 Peachtree St, Atlanta, GA",
 "makesOffer":{"@type":"Offer","name":"$5 Margaritas","price":"5.00","priceCurrency":"USD",
 "validThrough":"2030-01-01"}}
</script></head><body></body></html>`;

describe('StructuredExtractor', () => {
  const ex = new StructuredExtractor();
  it('pulls an Offer from JSON-LD', async () => {
    const { candidates } = await ex.extract(JSONLD, { url: 'https://x.test', defaultCategorySlug: 'food' });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('$5 Margaritas');
    expect(candidates[0].merchant).toBe('Taco Spot');
    expect(candidates[0].currentPriceMinor).toBe(500n);
    expect(candidates[0].address).toContain('Peachtree');
    expect(candidates[0].extractionPath).toBe('structured');
  });
  it('returns empty candidates for an unstructured page (triggers LLM fallback)', async () => {
    const { candidates } = await ex.extract('<html><body>just prose</body></html>', { url: 'https://x.test' });
    expect(candidates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest structured-extractor` → FAIL.

- [ ] **Step 3: Implement the interface + extractor**

```typescript
// src/crawler/extractors/deal-extractor.ts
import type { DealCandidate } from '../deal-candidate';

export type RawCandidate = Omit<DealCandidate, 'latitude' | 'longitude' | 'geocodeConfidence'>;
export interface ExtractionResult { candidates: RawCandidate[] }
export interface ExtractContext { url: string; merchantHint?: string; defaultCategorySlug?: string }
export interface DealExtractor { extract(html: string, ctx: ExtractContext): Promise<ExtractionResult> }
```

```typescript
// src/crawler/extractors/structured-extractor.ts
import type { DealExtractor, ExtractContext, ExtractionResult, RawCandidate } from './deal-extractor';

function priceToMinor(price?: string | number): bigint | null {
  if (price === undefined) return null;
  const n = typeof price === 'number' ? price : Number(String(price).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : null;
}

/** Deterministic extractor: JSON-LD Offers first, then a happy-hour/price regex. */
export class StructuredExtractor implements DealExtractor {
  async extract(html: string, ctx: ExtractContext): Promise<ExtractionResult> {
    const candidates = [...this.fromJsonLd(html, ctx), ...this.fromRegex(html, ctx)];
    return { candidates };
  }

  private fromJsonLd(html: string, ctx: ExtractContext): RawCandidate[] {
    const out: RawCandidate[] = [];
    const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const [, json] of blocks) {
      let data: any;
      try { data = JSON.parse(json.trim()); } catch { continue; }
      for (const node of Array.isArray(data) ? data : [data]) {
        const merchant = node.name ?? ctx.merchantHint ?? '';
        const address = typeof node.address === 'string'
          ? node.address
          : [node.address?.streetAddress, node.address?.addressLocality, node.address?.addressRegion]
              .filter(Boolean).join(', ');
        const offers = node.makesOffer ?? node.offers;
        for (const offer of (Array.isArray(offers) ? offers : offers ? [offers] : [])) {
          if (!offer?.name) continue;
          out.push({
            title: String(offer.name),
            merchant,
            categorySlug: ctx.defaultCategorySlug ?? 'food',
            address,
            startAt: offer.validFrom ? new Date(offer.validFrom) : null,
            expiresAt: offer.validThrough ? new Date(offer.validThrough) : null,
            sourceUrl: ctx.url,
            currentPriceMinor: priceToMinor(offer.price),
            couponCode: null,
            isStudentOnly: false,
            extractionPath: 'structured',
          });
        }
      }
    }
    return out;
  }

  private fromRegex(html: string, ctx: ExtractContext): RawCandidate[] {
    // Only fire when the page literally advertises a happy hour AND a price, to
    // keep precision high. Free-form pages with neither fall through to the LLM.
    const text = html.replace(/<[^>]+>/g, ' ');
    if (!/happy hour/i.test(text)) return [];
    const price = text.match(/\$\s?(\d+(?:\.\d{2})?)/);
    if (!price) return [];
    return [{
      title: 'Happy Hour',
      merchant: ctx.merchantHint ?? '',
      categorySlug: ctx.defaultCategorySlug ?? 'food',
      address: '',
      startAt: null,
      expiresAt: null,
      sourceUrl: ctx.url,
      currentPriceMinor: priceToMinor(price[1]),
      couponCode: null,
      isStudentOnly: false,
      extractionPath: 'structured',
    }];
  }
}
```

- [ ] **Step 4: Run it (passes)** — `cd backend && pnpm jest structured-extractor` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/crawler/extractors/deal-extractor.ts backend/src/crawler/extractors/structured-extractor.ts backend/src/crawler/extractors/structured-extractor.spec.ts
git commit -m "feat(backend): deterministic structured deal extractor"
```

---

### Task 2.3: LlmExtractor (Claude fallback, mockable)

**Files:**
- Create: `src/crawler/extractors/llm-extractor.ts`, `src/crawler/extractors/llm-extractor.spec.ts`
- Modify: `backend/package.json` (add `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `DealExtractor`, `RawCandidate`, `ExtractContext`.
- Produces: `class LlmExtractor implements DealExtractor`; constructor `(opts: { apiKey?: string; model?: string; client?: LlmClient })`; `interface LlmClient { complete(prompt: string): Promise<string> }` (returns the model's JSON text). Returns `{ candidates: [] }` when no `apiKey`/`client`.

- [ ] **Step 1: Add the dependency**

```bash
cd backend && pnpm add @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing test (mocked client)**

```typescript
// src/crawler/extractors/llm-extractor.spec.ts
import { LlmExtractor } from './llm-extractor';

const fakeJson = JSON.stringify({
  deals: [{
    title: 'Student Tuesday', merchant: 'Campus Cafe', categorySlug: 'food',
    address: '50 Decatur St, Atlanta, GA', price: '7.50',
    startDate: null, endDate: '2030-01-01', isStudentOnly: true, couponCode: null,
  }],
});

describe('LlmExtractor', () => {
  it('maps the model JSON to candidates with extractionPath=llm', async () => {
    const ex = new LlmExtractor({ client: { complete: async () => fakeJson } });
    const { candidates } = await ex.extract('<html>prose</html>', { url: 'https://x.test' });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('Student Tuesday');
    expect(candidates[0].currentPriceMinor).toBe(750n);
    expect(candidates[0].isStudentOnly).toBe(true);
    expect(candidates[0].extractionPath).toBe('llm');
  });
  it('returns no candidates when unconfigured', async () => {
    const ex = new LlmExtractor({});
    expect((await ex.extract('<html/>', { url: 'https://x.test' })).candidates).toEqual([]);
  });
  it('tolerates malformed model output', async () => {
    const ex = new LlmExtractor({ client: { complete: async () => 'not json' } });
    expect((await ex.extract('<html/>', { url: 'https://x.test' })).candidates).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it (fails)** — `cd backend && pnpm jest llm-extractor` → FAIL.

- [ ] **Step 4: Implement**

```typescript
// src/crawler/extractors/llm-extractor.ts
import Anthropic from '@anthropic-ai/sdk';
import type { DealExtractor, ExtractContext, ExtractionResult, RawCandidate } from './deal-extractor';

export interface LlmClient { complete(prompt: string): Promise<string> }

const DEFAULT_MODEL = 'claude-opus-4-8';

function priceToMinor(price: unknown): bigint | null {
  if (price === null || price === undefined) return null;
  const n = Number(String(price).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : null;
}

/** Anthropic-backed fallback. Behind LlmClient so tests inject a fake. Used ONLY
 * when StructuredExtractor yields nothing. Strips tags before prompting. */
export class LlmExtractor implements DealExtractor {
  private readonly client?: LlmClient;

  constructor(opts: { apiKey?: string; model?: string; client?: LlmClient }) {
    if (opts.client) {
      this.client = opts.client;
    } else if (opts.apiKey) {
      const sdk = new Anthropic({ apiKey: opts.apiKey });
      const model = opts.model ?? DEFAULT_MODEL;
      this.client = {
        complete: async (prompt: string) => {
          const res = await sdk.messages.create({
            model, max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          });
          const block = res.content.find((b) => b.type === 'text');
          return block && block.type === 'text' ? block.text : '';
        },
      };
    }
  }

  async extract(html: string, ctx: ExtractContext): Promise<ExtractionResult> {
    if (!this.client) return { candidates: [] };
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 12_000);
    const prompt =
      `Extract concrete deals/specials from this page as JSON ` +
      `{"deals":[{"title","merchant","categorySlug","address","price","startDate","endDate","isStudentOnly","couponCode"}]}. ` +
      `categorySlug ∈ food|groceries|entertainment. Use null for unknown fields. ` +
      `merchantHint="${ctx.merchantHint ?? ''}". Return ONLY JSON.\n\nPAGE:\n${text}`;

    let raw: string;
    try { raw = await this.client.complete(prompt); } catch { return { candidates: [] }; }

    let parsed: any;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch { return { candidates: [] }; }
    if (!parsed?.deals?.length) return { candidates: [] };

    const candidates: RawCandidate[] = parsed.deals
      .filter((d: any) => d?.title)
      .map((d: any): RawCandidate => ({
        title: String(d.title),
        merchant: String(d.merchant ?? ctx.merchantHint ?? ''),
        categorySlug: ['food', 'groceries', 'entertainment'].includes(d.categorySlug)
          ? d.categorySlug : (ctx.defaultCategorySlug ?? 'food'),
        address: String(d.address ?? ''),
        startAt: d.startDate ? new Date(d.startDate) : null,
        expiresAt: d.endDate ? new Date(d.endDate) : null,
        sourceUrl: ctx.url,
        currentPriceMinor: priceToMinor(d.price),
        couponCode: d.couponCode ? String(d.couponCode) : null,
        isStudentOnly: Boolean(d.isStudentOnly),
        extractionPath: 'llm',
      }));
    return { candidates };
  }
}
```

- [ ] **Step 5: Run it (passes)** — `cd backend && pnpm jest llm-extractor` → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/crawler/extractors/llm-extractor.ts backend/src/crawler/extractors/llm-extractor.spec.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(backend): Claude fallback deal extractor (mockable client)"
```

---

### Task 2.4: Geocoder (Nominatim default, Mapbox optional)

**Files:**
- Create: `src/crawler/geocoding/geocoder.ts`, `nominatim-geocoder.ts`, `mapbox-geocoder.ts`, `geocoder.provider.ts`, `nominatim-geocoder.spec.ts`

**Interfaces:**
- Produces: `interface GeocodeResult { latitude: number; longitude: number; confidence: number }`;
  `interface Geocoder { geocode(address: string): Promise<GeocodeResult | null> }`;
  `class NominatimGeocoder implements Geocoder` (ctor `(fetchFn?: typeof fetch)`);
  `class MapboxGeocoder implements Geocoder` (ctor `(apiKey: string, fetchFn?: typeof fetch)`);
  Nest provider token `GEOCODER` → impl chosen by `GEOCODER_KEY`.

- [ ] **Step 1: Write the failing test (mock fetch)**

```typescript
// src/crawler/geocoding/nominatim-geocoder.spec.ts
import { NominatimGeocoder } from './nominatim-geocoder';

describe('NominatimGeocoder', () => {
  it('maps the first result to lat/lng + confidence', async () => {
    const fetchFn = (async () => ({
      ok: true,
      json: async () => [{ lat: '33.7531', lon: '-84.3857', importance: 0.8 }],
    })) as unknown as typeof fetch;
    const geo = new NominatimGeocoder(fetchFn);
    const r = await geo.geocode('1 Peachtree St, Atlanta, GA');
    expect(r).toEqual({ latitude: 33.7531, longitude: -84.3857, confidence: 0.8 });
  });
  it('returns null when there is no match', async () => {
    const fetchFn = (async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
    expect(await new NominatimGeocoder(fetchFn).geocode('nowhere')).toBeNull();
  });
  it('returns null (never throws) on a transport error', async () => {
    const fetchFn = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await new NominatimGeocoder(fetchFn).geocode('x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest nominatim-geocoder` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/crawler/geocoding/geocoder.ts
export interface GeocodeResult { latitude: number; longitude: number; confidence: number }
export interface Geocoder { geocode(address: string): Promise<GeocodeResult | null> }
export const GEOCODER = Symbol('GEOCODER');
```

```typescript
// src/crawler/geocoding/nominatim-geocoder.ts
import type { Geocoder, GeocodeResult } from './geocoder';

/** Free OpenStreetMap geocoder. Polite UA + single-result. Never throws. */
export class NominatimGeocoder implements Geocoder {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    if (!address.trim()) return null;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    try {
      const res = await this.fetchFn(url, {
        headers: { 'User-Agent': 'DealyCrawler/1.0 (+https://dealy.app)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ lat: string; lon: string; importance?: number }>;
      const top = rows[0];
      if (!top) return null;
      return {
        latitude: Number(top.lat),
        longitude: Number(top.lon),
        confidence: typeof top.importance === 'number' ? top.importance : 0.5,
      };
    } catch {
      return null;
    }
  }
}
```

```typescript
// src/crawler/geocoding/mapbox-geocoder.ts
import type { Geocoder, GeocodeResult } from './geocoder';

/** Optional higher-accuracy geocoder, enabled when GEOCODER_KEY is set. */
export class MapboxGeocoder implements Geocoder {
  constructor(private readonly apiKey: string, private readonly fetchFn: typeof fetch = fetch) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    if (!address.trim()) return null;
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
    );
    url.searchParams.set('access_token', this.apiKey);
    url.searchParams.set('limit', '1');
    try {
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { features?: Array<{ center: [number, number]; relevance?: number }> };
      const f = data.features?.[0];
      if (!f) return null;
      return { latitude: f.center[1], longitude: f.center[0], confidence: f.relevance ?? 0.5 };
    } catch {
      return null;
    }
  }
}
```

```typescript
// src/crawler/geocoding/geocoder.provider.ts
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { GEOCODER } from './geocoder';
import { NominatimGeocoder } from './nominatim-geocoder';
import { MapboxGeocoder } from './mapbox-geocoder';

export const geocoderProvider: Provider = {
  provide: GEOCODER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const key = config.get('GEOCODER_KEY', { infer: true });
    return key ? new MapboxGeocoder(key) : new NominatimGeocoder();
  },
};
```

- [ ] **Step 4: Run it (passes)** — `cd backend && pnpm jest nominatim-geocoder` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/crawler/geocoding
git commit -m "feat(backend): pluggable geocoder (Nominatim default, Mapbox optional)"
```

---

### Task 2.5: SourceFetcher (polite HTTP)

**Files:**
- Create: `src/crawler/source-fetcher.ts`, `src/crawler/source-fetcher.spec.ts`

**Interfaces:**
- Produces: `class SourceFetcher { constructor(fetchFn?: typeof fetch); fetchPage(url: string): Promise<string> }` — throws on non-OK / oversize / timeout so the crawler records a `CrawlFailure`. `MAX_BYTES = 2_000_000`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/crawler/source-fetcher.spec.ts
import { SourceFetcher } from './source-fetcher';

describe('SourceFetcher', () => {
  it('returns the body on 200', async () => {
    const fetchFn = (async () => ({
      ok: true, status: 200,
      headers: new Map([['content-length', '20']]),
      text: async () => '<html>ok</html>',
    })) as unknown as typeof fetch;
    expect(await new SourceFetcher(fetchFn).fetchPage('https://x.test')).toContain('ok');
  });
  it('throws on a non-OK status', async () => {
    const fetchFn = (async () => ({ ok: false, status: 503, headers: new Map(), text: async () => '' })) as unknown as typeof fetch;
    await expect(new SourceFetcher(fetchFn).fetchPage('https://x.test')).rejects.toThrow('503');
  });
  it('throws when the body exceeds the size cap', async () => {
    const fetchFn = (async () => ({
      ok: true, status: 200,
      headers: new Map([['content-length', String(5_000_000)]]),
      text: async () => '',
    })) as unknown as typeof fetch;
    await expect(new SourceFetcher(fetchFn).fetchPage('https://x.test')).rejects.toThrow(/too large/i);
  });
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest source-fetcher` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/crawler/source-fetcher.ts
export const MAX_BYTES = 2_000_000;

/** Polite single-page fetch: descriptive UA, timeout, and a hard size cap. */
export class SourceFetcher {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async fetchPage(url: string): Promise<string> {
    const res = await this.fetchFn(url, {
      headers: { 'User-Agent': 'DealyCrawler/1.0 (+https://dealy.app/crawler)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > MAX_BYTES) throw new Error(`response too large (${len} bytes)`);
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new Error(`response too large (${body.length} bytes)`);
    return body;
  }
}
```

> robots.txt: v1 honors a per-source `enabled` flag and operator-curated seed URLs (operators only add sources they're permitted to crawl). A `robots.txt` check is a fast-follow; note it in `backend/docs/providers.md` when wiring sources.

- [ ] **Step 4: Run it (passes)** — `cd backend && pnpm jest source-fetcher` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/crawler/source-fetcher.ts backend/src/crawler/source-fetcher.spec.ts
git commit -m "feat(backend): polite source fetcher with size + timeout caps"
```

---

### Task 2.6: CrawlerService + module + CLI

**Files:**
- Create: `src/crawler/crawler.service.ts`, `src/crawler/crawler.service.spec.ts`, `src/crawler/crawler.module.ts`, `src/crawler/crawl-cli.ts`
- Modify: `src/app.module.ts`, `backend/package.json`

**Interfaces:**
- Consumes: `SourceFetcher`, `StructuredExtractor`, `LlmExtractor` (as `GEOCODER`-style injected `DealExtractor`s), `Geocoder` (token `GEOCODER`), `confidenceScore`, `dealFingerprint` + `validateNormalizedDeal` patterns, `autoPublishKinds`, `derive... ` not needed here.
- Produces: `class CrawlerService { runSource(sourceId: string): Promise<CrawlRunSummary>; runAll(): Promise<CrawlRunSummary[]> }`;
  `interface CrawlRunSummary { runId; sourceId; status: 'succeeded'|'failed'; fetched; queued; deduped; failed; autoPublished }`.

- [ ] **Step 1: Write the failing test (in-memory fakes)**

```typescript
// src/crawler/crawler.service.spec.ts
import { CrawlerService } from './crawler.service';
import { StructuredExtractor } from './extractors/structured-extractor';
import { LlmExtractor } from './extractors/llm-extractor';

const HTML = `<html><head><script type="application/ld+json">
{"@type":"Restaurant","name":"Taco Spot","address":"1 Peachtree St, Atlanta, GA",
 "makesOffer":{"@type":"Offer","name":"$5 Margaritas","price":"5.00","validThrough":"2030-01-01"}}
</script></head></html>`;

function makeService(over: Partial<any> = {}) {
  const created: any[] = [];
  const prisma = {
    crawlSource: { findUniqueOrThrow: async () => ({ id: 's1', url: 'https://x.test', kind: 'restaurant', defaultCategorySlug: 'food', merchantHint: null, enabled: true }) },
    crawlRun: { create: async () => ({ id: 'r1' }), update: async () => ({}) },
    crawlFailure: { create: async () => ({}) },
    category: { findMany: async () => [{ id: 'cat-food', slug: 'food' }] },
    deal: {
      findFirst: async () => null,
      findUnique: async () => null,
      upsert: async ({ create }: any) => { created.push(create); return { id: `deal-${created.length}` }; },
    },
    ...over.prisma,
  };
  const fetcher = { fetchPage: async () => HTML };
  const geocoder = { geocode: async () => ({ latitude: 33.75, longitude: -84.39, confidence: 0.9 }) };
  const config = { get: () => undefined };
  const search = { upsertDeals: async () => {} };
  const service = new CrawlerService(
    prisma as any, fetcher as any, new StructuredExtractor(),
    new LlmExtractor({}), geocoder as any, config as any, search as any,
  );
  return { service, created };
}

describe('CrawlerService', () => {
  it('crawls → extracts → geocodes → queues a draft pending curated deal', async () => {
    const { service, created } = makeService();
    const summary = await service.runSource('s1');
    expect(summary.status).toBe('succeeded');
    expect(summary.queued).toBe(1);
    expect(created[0]).toMatchObject({
      status: 'draft', moderationStatus: 'pending', sourceTrust: 'editorial', latitude: 33.75,
    });
    expect(created[0].confidenceScore).toBeGreaterThan(0);
  });

  it('auto-publishes when confidence ≥ threshold and kind is allowlisted', async () => {
    const { service, created } = makeService({});
    (service as any).config = { get: (k: string) =>
      k === 'CRAWLER_AUTOPUBLISH_THRESHOLD' ? 50 : k === 'CRAWLER_AUTOPUBLISH_KINDS' ? 'restaurant' : undefined };
    const summary = await service.runSource('s1');
    expect(summary.autoPublished).toBe(1);
    expect(created[0]).toMatchObject({ status: 'published', moderationStatus: 'approved' });
  });

  it('never auto-publishes a low-confidence geocode', async () => {
    const { service, created } = makeService({});
    (service as any).geocoder = { geocode: async () => ({ latitude: 1, longitude: 1, confidence: 0.1 }) };
    (service as any).config = { get: (k: string) =>
      k === 'CRAWLER_AUTOPUBLISH_THRESHOLD' ? 1 : k === 'CRAWLER_AUTOPUBLISH_KINDS' ? 'restaurant' : undefined };
    const summary = await service.runSource('s1');
    expect(summary.autoPublished).toBe(0);
    expect(created[0]).toMatchObject({ status: 'draft', moderationStatus: 'pending' });
  });
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest crawler.service` → FAIL.

- [ ] **Step 3: Implement the service**

```typescript
// src/crawler/crawler.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexer } from '../search/search-indexer.service';
import type { Env } from '../config/env.schema';
import { autoPublishKinds } from '../config/env.schema';
import { SourceFetcher } from './source-fetcher';
import { StructuredExtractor } from './extractors/structured-extractor';
import { LlmExtractor } from './extractors/llm-extractor';
import { GEOCODER, type Geocoder } from './geocoding/geocoder';
import { confidenceScore, LOW_GEOCODE_CONFIDENCE, type DealCandidate } from './deal-candidate';
import type { RawCandidate } from './extractors/deal-extractor';

export interface CrawlRunSummary {
  runId: string; sourceId: string;
  status: 'succeeded' | 'failed';
  fetched: number; queued: number; deduped: number; failed: number; autoPublished: number;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: SourceFetcher,
    private readonly structured: StructuredExtractor,
    private readonly llm: LlmExtractor,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
    private readonly config: ConfigService<Env, true>,
    private readonly search: SearchIndexer,
  ) {}

  async runAll(): Promise<CrawlRunSummary[]> {
    const sources = await this.prisma.crawlSource.findMany({ where: { enabled: true } });
    const out: CrawlRunSummary[] = [];
    for (const s of sources) out.push(await this.runSource(s.id));
    return out;
  }

  async runSource(sourceId: string): Promise<CrawlRunSummary> {
    const source = await this.prisma.crawlSource.findUniqueOrThrow({ where: { id: sourceId } });
    const run = await this.prisma.crawlRun.create({ data: { sourceId } });
    let fetched = 0, queued = 0, deduped = 0, failed = 0, autoPublished = 0;
    const publishedIds: string[] = [];

    try {
      const html = await this.fetcher.fetchPage(source.url);
      const ctx = { url: source.url, merchantHint: source.merchantHint ?? undefined, defaultCategorySlug: source.defaultCategorySlug ?? undefined };

      // Hybrid: structured first, LLM only if structured found nothing.
      let raws: RawCandidate[] = (await this.structured.extract(html, ctx)).candidates;
      if (raws.length === 0) raws = (await this.llm.extract(html, ctx)).candidates;
      fetched = raws.length;

      const categories = new Map(
        (await this.prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]),
      );
      const threshold = this.config.get('CRAWLER_AUTOPUBLISH_THRESHOLD', { infer: true });
      const kinds = autoPublishKinds({ CRAWLER_AUTOPUBLISH_KINDS: this.config.get('CRAWLER_AUTOPUBLISH_KINDS', { infer: true }) });

      for (const raw of raws) {
        try {
          const geo = raw.address ? await this.geocoder.geocode(raw.address) : null;
          const candidate: DealCandidate = {
            ...raw,
            latitude: geo?.latitude ?? null,
            longitude: geo?.longitude ?? null,
            geocodeConfidence: geo?.confidence ?? 0,
          };
          const categoryId = categories.get(candidate.categorySlug);
          if (!categoryId) throw new Error(`unknown category "${candidate.categorySlug}"`);
          if (!candidate.expiresAt || candidate.expiresAt.getTime() <= Date.now()) {
            // Default a 14-day window for dateless specials so they can expire.
            candidate.expiresAt = new Date(Date.now() + 14 * 86_400_000);
          }

          const score = confidenceScore(candidate);
          const externalId = `crawl-${source.id}-${this.slug(candidate.title)}`;
          const fingerprint = this.fingerprint(candidate);

          const dupe = await this.prisma.deal.findFirst({
            where: { fingerprint, externalId: { not: externalId } }, select: { id: true },
          });
          if (dupe) { deduped++; continue; }

          const goodGeocode = candidate.geocodeConfidence >= LOW_GEOCODE_CONFIDENCE;
          const autoOk =
            threshold !== undefined && score >= threshold && goodGeocode && kinds.includes(source.kind);

          const data: Prisma.DealUncheckedCreateInput = {
            externalId,
            title: candidate.title,
            merchant: candidate.merchant || 'Unknown',
            categoryId,
            shortDescription: candidate.title,
            detailedDescription: '',
            terms: '',
            currentPriceMinor: candidate.currentPriceMinor,
            originalPriceMinor: null,
            currency: 'USD',
            dealScore: 50,
            isOnline: candidate.latitude === null,
            isStudentOnly: candidate.isStudentOnly,
            couponCode: candidate.couponCode,
            destinationUrl: candidate.sourceUrl,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            locationTags: [],
            visualSeed: Math.abs(this.hash(externalId)) % 1000,
            status: autoOk ? 'published' : 'draft',
            moderationStatus: autoOk ? 'approved' : 'pending',
            source: 'crawler',
            sourceTrust: 'editorial',
            sourceUrl: candidate.sourceUrl,
            providerAttribution: null,
            verificationStatus: 'pending',
            confidenceScore: score,
            crawlSourceId: source.id,
            fingerprint,
            startAt: candidate.startAt,
            expiresAt: candidate.expiresAt,
          };

          const deal = await this.prisma.deal.upsert({
            where: { externalId },
            update: { confidenceScore: score, latitude: candidate.latitude, longitude: candidate.longitude },
            create: data,
            select: { id: true },
          });
          queued++;
          if (autoOk) { autoPublished++; publishedIds.push(deal.id); }
        } catch (err) {
          failed++;
          await this.prisma.crawlFailure.create({
            data: { runId: run.id, url: source.url, reason: (err as Error).message },
          });
        }
      }

      try { await this.search.upsertDeals(publishedIds); }
      catch (err) { this.logger.warn(`search index: ${(err as Error).message}`); }

      await this.prisma.crawlRun.update({
        where: { id: run.id },
        data: { status: 'succeeded', fetched, queued, deduped, failed, finishedAt: new Date() },
      });
      await this.prisma.crawlSource.update({ where: { id: source.id }, data: { lastCrawledAt: new Date() } });
      return { runId: run.id, sourceId, status: 'succeeded', fetched, queued, deduped, failed, autoPublished };
    } catch (err) {
      await this.prisma.crawlRun.update({
        where: { id: run.id }, data: { status: 'failed', error: (err as Error).message, finishedAt: new Date() },
      });
      return { runId: run.id, sourceId, status: 'failed', fetched, queued, deduped, failed, autoPublished };
    }
  }

  private slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }
  private fingerprint(c: DealCandidate): string {
    const loc = c.latitude !== null ? `${c.latitude},${c.longitude}` : 'online';
    return require('node:crypto').createHash('sha1')
      .update([c.merchant, c.title, loc, String(c.currentPriceMinor ?? ''), c.categorySlug].join('|').toLowerCase())
      .digest('hex');
  }
  private hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
}
```

- [ ] **Step 4: Run it (passes)** — `cd backend && pnpm jest crawler.service` → PASS.

- [ ] **Step 5: Create the module + CLI + register**

```typescript
// src/crawler/crawler.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { CrawlerService } from './crawler.service';
import { SourceFetcher } from './source-fetcher';
import { StructuredExtractor } from './extractors/structured-extractor';
import { LlmExtractor } from './extractors/llm-extractor';
import { geocoderProvider } from './geocoding/geocoder.provider';

@Module({
  imports: [PrismaModule, SearchModule, ConfigModule],
  providers: [
    CrawlerService,
    SourceFetcher,
    StructuredExtractor,
    geocoderProvider,
    {
      provide: LlmExtractor,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new LlmExtractor({ apiKey: config.get('ANTHROPIC_API_KEY', { infer: true }) }),
    },
  ],
  exports: [CrawlerService],
})
export class CrawlerModule {}
```

> Add `ANTHROPIC_API_KEY: optionalString` to `env.schema.ts` (same pattern as Task 1.3) so the factory can read it. Without it, `LlmExtractor` no-ops and only structured extraction runs.

```typescript
// src/crawler/crawl-cli.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CrawlerService } from './crawler.service';

/** CLI: `pnpm crawl <sourceId|all>`. */
async function main(): Promise<void> {
  const arg = process.argv[2] ?? 'all';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const svc = app.get(CrawlerService);
  const result = arg === 'all' ? await svc.runAll() : await svc.runSource(arg);
  console.log(JSON.stringify(result, null, 2));
  await app.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
```

Register in `src/app.module.ts` — add `CrawlerModule` to the `imports` array (alongside the existing feature modules). Add the script to `backend/package.json` `"scripts"`:

```json
    "crawl": "ts-node -r tsconfig-paths/register src/crawler/crawl-cli.ts",
```

(Match the existing `ingest` script's runner — copy its exact command, substituting the cli path.)

- [ ] **Step 6: Verify build + full crawler suite**

Run: `cd backend && pnpm build && pnpm jest src/crawler`
Expected: build OK; all crawler specs PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/crawler backend/src/app.module.ts backend/package.json backend/src/config/env.schema.ts
git commit -m "feat(backend): crawler service, module, and pnpm crawl CLI"
```

---

## PHASE 3 — MODERATION WORKFLOW

### Task 3.1: ModerationService (queue / approve / reject / edit)

**Files:**
- Create: `src/admin/moderation.service.ts`, `src/admin/moderation.service.spec.ts`, `src/admin/moderation.dto.ts`
- Modify: `src/admin/admin.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `SearchIndexer`, `AuditService` (existing).
- Produces: `class ModerationService { queue(opts): Promise<Deal[]>; approve(actorId, id): Promise<{id,status}>; reject(actorId, id, reason): Promise<{id,status}>; edit(actorId, id, patch: ModerationEdit): Promise<{id}> }`;
  `interface ModerationEdit { title?; merchant?; categoryId?; latitude?; longitude?; startAt?; expiresAt? }`.

- [ ] **Step 1: Write the failing test (mock prisma/search/audit)**

```typescript
// src/admin/moderation.service.spec.ts
import { ModerationService } from './moderation.service';

function make() {
  const updates: any[] = [];
  const audits: any[] = [];
  const prisma = {
    deal: {
      findMany: async () => [{ id: 'd1', confidenceScore: 90 }],
      findUnique: async () => ({ id: 'd1', title: 'old', latitude: 1, status: 'draft' }),
      update: async ({ where, data }: any) => { updates.push({ id: where.id, data }); return { id: where.id, ...data }; },
    },
  };
  const search = { upsertDeals: async () => {}, removeDeal: async () => {} };
  const audit = { log: async (...a: any[]) => { audits.push(a); } };
  return { svc: new ModerationService(prisma as any, search as any, audit as any), updates, audits };
}

describe('ModerationService', () => {
  it('approve publishes + approves + audits', async () => {
    const { svc, updates, audits } = make();
    const r = await svc.approve('admin', 'd1');
    expect(r).toEqual({ id: 'd1', status: 'published' });
    expect(updates[0].data).toMatchObject({ status: 'published', moderationStatus: 'approved' });
    expect(audits[0][1]).toBe('deal.moderate.approve');
  });
  it('reject archives + rejects + audits the reason', async () => {
    const { svc, updates, audits } = make();
    await svc.reject('admin', 'd1', 'spam');
    expect(updates[0].data).toMatchObject({ status: 'archived', moderationStatus: 'rejected' });
    expect(audits[0][3]).toMatchObject({ reason: 'spam' });
  });
  it('edit patches only provided fields and audits a diff', async () => {
    const { svc, updates, audits } = make();
    await svc.edit('admin', 'd1', { title: 'new' });
    expect(updates[0].data).toEqual({ title: 'new' });
    expect(audits[0][1]).toBe('deal.moderate.edit');
  });
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest moderation.service` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/admin/moderation.dto.ts
import { IsInt, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

export class ModerationQueueQuery {
  @IsOptional() @IsString() source?: string;       // crawlSourceId
  @IsOptional() @IsString() category?: string;      // category slug
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}
export class RejectDto { @IsString() @MaxLength(280) reason!: string; }
export class ModerationEditDto {
  @IsOptional() @IsString() @MaxLength(140) title?: string;
  @IsOptional() @IsString() @MaxLength(140) merchant?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
```

```typescript
// src/admin/moderation.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexer } from '../search/search-indexer.service';
import { AuditService } from './audit.service';

export interface ModerationEdit {
  title?: string; merchant?: string; categoryId?: string;
  latitude?: number; longitude?: number; startAt?: string; expiresAt?: string;
}

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchIndexer,
    private readonly audit: AuditService,
  ) {}

  /** Pending curated candidates, highest confidence first. */
  queue(opts: { source?: string; category?: string; limit?: number } = {}) {
    return this.prisma.deal.findMany({
      where: {
        moderationStatus: 'pending',
        sourceTrust: 'editorial',
        ...(opts.source ? { crawlSourceId: opts.source } : {}),
        ...(opts.category ? { category: { slug: opts.category } } : {}),
      },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      take: opts.limit ?? 50,
      include: { category: { select: { slug: true } }, crawlSource: { select: { url: true, kind: true } } },
    });
  }

  async approve(actorId: string, dealId: string): Promise<{ id: string; status: 'published' }> {
    await this.requireDeal(dealId);
    await this.prisma.deal.update({
      where: { id: dealId }, data: { status: 'published', moderationStatus: 'approved' },
    });
    await this.search.upsertDeals([dealId]);
    await this.audit.log(actorId, 'deal.moderate.approve', { type: 'deal', id: dealId }, {});
    return { id: dealId, status: 'published' };
  }

  async reject(actorId: string, dealId: string, reason: string): Promise<{ id: string; status: 'archived' }> {
    await this.requireDeal(dealId);
    await this.prisma.deal.update({
      where: { id: dealId }, data: { status: 'archived', moderationStatus: 'rejected' },
    });
    await this.search.removeDeal(dealId);
    await this.audit.log(actorId, 'deal.moderate.reject', { type: 'deal', id: dealId }, { reason });
    return { id: dealId, status: 'archived' };
  }

  async edit(actorId: string, dealId: string, patch: ModerationEdit): Promise<{ id: string }> {
    const before = await this.requireDeal(dealId);
    const data: Prisma.DealUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.merchant !== undefined) data.merchant = patch.merchant;
    if (patch.categoryId !== undefined) data.category = { connect: { id: patch.categoryId } };
    if (patch.latitude !== undefined) data.latitude = patch.latitude;
    if (patch.longitude !== undefined) data.longitude = patch.longitude;
    if (patch.startAt !== undefined) data.startAt = new Date(patch.startAt);
    if (patch.expiresAt !== undefined) data.expiresAt = new Date(patch.expiresAt);
    await this.prisma.deal.update({ where: { id: dealId }, data });
    await this.audit.log(actorId, 'deal.moderate.edit', { type: 'deal', id: dealId },
      { before: { title: before.title, latitude: before.latitude }, patch });
    return { id: dealId };
  }

  private async requireDeal(id: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }
}
```

In `src/admin/admin.module.ts`, add `ModerationService` to `providers` and `exports`.

- [ ] **Step 4: Run it (passes)** — `cd backend && pnpm jest moderation.service` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/moderation.service.ts backend/src/admin/moderation.service.spec.ts backend/src/admin/moderation.dto.ts backend/src/admin/admin.module.ts
git commit -m "feat(backend): curated moderation service (queue/approve/reject/edit)"
```

---

### Task 3.2: Moderation admin endpoints

**Files:**
- Modify: `src/admin/admin.controller.ts`
- Test: `src/admin/admin.controller.spec.ts` (create)

**Interfaces:**
- Consumes: `ModerationService` (Task 3.1), DTOs from `moderation.dto.ts`.
- Produces: routes `GET /v1/admin/moderation/queue`, `POST /v1/admin/moderation/:id/approve`, `.../reject`, `.../edit` — all `@Roles(admin)`.

- [ ] **Step 1: Write the failing controller test**

```typescript
// src/admin/admin.controller.spec.ts
import { AdminController } from './admin.controller';

describe('AdminController moderation routes', () => {
  const moderation = {
    queue: jest.fn(async () => [{ id: 'd1' }]),
    approve: jest.fn(async () => ({ id: 'd1', status: 'published' })),
    reject: jest.fn(async () => ({ id: 'd1', status: 'archived' })),
    edit: jest.fn(async () => ({ id: 'd1' })),
  };
  const ctrl = new AdminController({} as any, {} as any, {} as any, moderation as any);
  const actor = { id: 'admin' } as any;

  it('queue delegates with filters', async () => {
    await ctrl.moderationQueue({ category: 'food', limit: 10 } as any);
    expect(moderation.queue).toHaveBeenCalledWith({ source: undefined, category: 'food', limit: 10 });
  });
  it('approve delegates', async () => {
    expect(await ctrl.approve(actor, 'd1')).toEqual({ id: 'd1', status: 'published' });
    expect(moderation.approve).toHaveBeenCalledWith('admin', 'd1');
  });
  it('reject delegates the reason', async () => {
    await ctrl.reject(actor, 'd1', { reason: 'spam' } as any);
    expect(moderation.reject).toHaveBeenCalledWith('admin', 'd1', 'spam');
  });
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest admin.controller` → FAIL.

- [ ] **Step 3: Implement the routes**

In `src/admin/admin.controller.ts`: inject `ModerationService` as a 4th constructor arg, import DTOs + `Query`/`Body`, and add:

```typescript
  @Get('moderation/queue')
  @ApiOperation({ summary: 'Pending curated candidates (highest confidence first)' })
  moderationQueue(@Query() q: ModerationQueueQuery) {
    return this.moderation.queue({ source: q.source, category: q.category, limit: q.limit });
  }

  @Post('moderation/:id/approve')
  approve(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.moderation.approve(actor.id, id);
  }

  @Post('moderation/:id/reject')
  reject(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto) {
    return this.moderation.reject(actor.id, id, dto.reason);
  }

  @Post('moderation/:id/edit')
  edit(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationEditDto) {
    return this.moderation.edit(actor.id, id, dto);
  }
```

Add imports at the top: `Query, Body` from `@nestjs/common`; `ModerationService` from `./moderation.service`; `ModerationQueueQuery, RejectDto, ModerationEditDto` from `./moderation.dto`. Add `private readonly moderation: ModerationService` to the constructor.

- [ ] **Step 4: Run it (passes) + build** — `cd backend && pnpm jest admin.controller && pnpm build` → PASS / OK.

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/admin.controller.ts backend/src/admin/admin.controller.spec.ts
git commit -m "feat(backend): admin moderation endpoints (queue/approve/reject/edit)"
```

---

## PHASE 4 — FEED BLENDING + NEVER-EMPTY

### Task 4.1: Blend ladder in FeedsService.nearby()

**Files:**
- Modify: `src/feeds/feeds.service.ts`, `src/deals/deal.dto.ts`
- Test: `src/feeds/feeds.service.spec.ts` (create)

**Interfaces:**
- Consumes: `CoverageService.coverageForPoint` (existing), `FEED_TIER_CASE_SQL`/`feedTierRank` (Task 1.1), `mapNearbyRow` (extended Task 1.4).
- Produces: rewritten `nearby(q)` returning `NearbyDealPage` whose `items` are tier-ranked and never empty when ANY tier has inventory in range; `NearbyDealPage.blend: { radiusMilesUsed: number; tiersIncluded: FeedTier[] }`.

- [ ] **Step 1: Add the `blend` field to the response type**

In `deal.dto.ts`, extend `NearbyDealPage`:

```typescript
import type { FeedTier } from '../feeds/feed-tier';
// …
export interface NearbyDealPage extends DealPage {
  coverage: NearbyCoverage;
  /** How the never-empty ladder assembled this page (honesty signal). */
  blend: { radiusMilesUsed: number; tiersIncluded: FeedTier[] };
}
```

- [ ] **Step 2: Write the failing test (DB-backed)**

```typescript
// src/feeds/feeds.service.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CoverageService } from '../coverage/coverage.service';
import { FeedsService } from './feeds.service';

// Atlanta center used by the pilot zone.
const LAT = 33.7531, LNG = -84.3857;

describe('FeedsService.nearby blend ladder', () => {
  let prisma: PrismaService; let feeds: FeedsService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [FeedsService, CoverageService, PrismaService],
    }).compile();
    prisma = mod.get(PrismaService); feeds = mod.get(FeedsService);
  });
  afterAll(async () => prisma.$disconnect());

  async function seedCurated(title: string) {
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });
    await prisma.$executeRawUnsafe(`
      INSERT INTO deals (id,external_id,title,merchant,category_id,status,moderation_status,
        source,source_trust,verification_status,is_online,latitude,longitude,
        geog,location_tags,expires_at,created_at,updated_at)
      VALUES (gen_random_uuid(),$1,$2,'Cantina',$3,'published','approved',
        'crawler','editorial','pending',false,$4,$5,
        ST_SetSRID(ST_MakePoint($5,$4),4326)::geography,'{}',now()+interval '7 days',now(),now())
    `, `t-${title}`, title, cat.id, LAT, LNG);
  }

  it('blends CURATED when there is no VERIFIED inventory (never empty)', async () => {
    await seedCurated(`curated-${Date.now()}`);
    const page = await feeds.nearby({ lat: LAT, lng: LNG, radiusMiles: 10, limit: 20 } as any);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.blend.tiersIncluded).toContain('curated');
    // Honesty preserved: curated items are NOT badged verified.
    expect(page.items.every((d) => d.trustLevel !== 'verified' ? !d.verified : true)).toBe(true);
  });
});
```

- [ ] **Step 3: Run it (fails)** — `cd backend && pnpm jest feeds.service` → FAIL (no blend yet; curated excluded by `source_trust='authoritative'` filter).

- [ ] **Step 4: Rewrite `nearby()` with the ladder**

Replace the body of `nearby()` in `feeds.service.ts`. Keep `online()` unchanged. Key changes: drop the hard `if (!coverage.qualified) return empty`; instead always assemble, expanding radius and widening the tier filter until `limit` is met. Add `source_trust`, `moderation_status`, `status`, `confidence_score` to the SELECT (consumed by the extended `mapNearbyRow`).

```typescript
import { FEED_TIER_CASE_SQL } from './feed-tier';
import type { FeedTier } from './feed-tier';
// …

async nearby(q: NearbyFeedQuery): Promise<NearbyDealPage> {
  const coverage = await this.coverage.coverageForPoint(q.lat, q.lng); // retained signal
  const limit = q.limit ?? 20;
  const baseRadius = q.radiusMiles ?? 10;
  const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`;
  const cursor = q.cursor ? decodeBlendCursor(q.cursor) : null;
  const categoryFilter = q.category
    ? Prisma.sql`AND d.category_id = (SELECT id FROM categories WHERE slug = ${q.category})`
    : Prisma.empty;

  // Ladder: each step widens what qualifies. We re-query at the widest needed
  // radius once and let the tier-rank ordering + LIMIT do the blending, so a
  // single keyset query stays correct. The page-1 (no cursor) path probes radii.
  const radii = [baseRadius, Math.max(baseRadius, 25), Math.max(baseRadius, 50)];
  let rows: NearbyRow[] = [];
  let radiusUsed = baseRadius;

  for (const radiusMiles of cursor ? [cursor.radius] : radii) {
    radiusUsed = radiusMiles;
    rows = await this.queryBlended(center, radiusMiles * METERS_PER_MILE, limit, categoryFilter, cursor);
    if (rows.length >= limit || radiusMiles === radii[radii.length - 1]) break;
  }

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeBlendCursor(radiusUsed, Number(last.tier_rank), Number(last.sort_key), last.id)
    : null;
  const tiersIncluded = [...new Set(page.map((r) => r.feed_tier as FeedTier))];

  return {
    items: page.map(mapNearbyRow),
    nextCursor,
    coverage,
    blend: { radiusMilesUsed: radiusUsed, tiersIncluded },
  };
}

/** One blended, tier-ranked, keyset-paginated page. Includes VERIFIED (physical),
 * CURATED, and ONLINE inventory; COMMUNITY is reserved and matches nothing yet. */
private async queryBlended(
  center: Prisma.Sql, radiusMeters: number, limit: number,
  categoryFilter: Prisma.Sql, cursor: BlendCursor | null,
): Promise<NearbyRow[]> {
  const cursorFilter = cursor
    ? Prisma.sql`WHERE (tier_rank, sort_key, id) > (${cursor.tierRank}::int, ${cursor.sortKey}::double precision, ${cursor.id}::uuid)`
    : Prisma.empty;
  return this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
    WITH candidates AS (
      SELECT d.id, d.title, d.merchant, cat.slug AS category_slug,
             d.short_description, d.detailed_description, d.terms,
             d.current_price_minor, d.original_price_minor, d.currency,
             d.deal_score, d.is_online, d.is_student_only, d.coupon_code, d.destination_url,
             d.latitude, d.longitude, d.location_tags, d.visual_seed,
             d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
             d.status, d.confidence_score, d.created_at, d.start_at, d.expires_at,
             ST_Distance(d.geog, ${center}) AS distance_meters,
             (${Prisma.raw(FEED_TIER_CASE_SQL)})::int AS tier_rank,
             CASE (${Prisma.raw(FEED_TIER_CASE_SQL)})
               WHEN 0 THEN 'verified' WHEN 1 THEN 'curated'
               WHEN 2 THEN 'online' ELSE 'community' END AS feed_tier,
             round(ST_Distance(d.geog, ${center}))::double precision AS sort_key
      FROM deals d
      JOIN categories cat ON cat.id = d.category_id
      WHERE d.status = 'published'::deal_status
        AND d.expires_at > now()
        AND d.geog IS NOT NULL
        AND ST_DWithin(d.geog, ${center}, ${radiusMeters})
        AND (
          (d.source_trust = 'authoritative'::source_trust AND d.verification_status = 'verified'::verification_status)
          OR (d.source_trust = 'editorial'::source_trust AND d.moderation_status = 'approved'::moderation_status)
        )
        ${categoryFilter}
    )
    SELECT * FROM candidates
    ${cursorFilter}
    ORDER BY tier_rank ASC, sort_key ASC, id ASC
    LIMIT ${limit + 1}
  `);
}
```

Add the composite cursor helpers + the `tier_rank`/`feed_tier` row fields. In `feeds.service.ts`:

```typescript
interface BlendCursor { radius: number; tierRank: number; sortKey: number; id: string }
function encodeBlendCursor(radius: number, tierRank: number, sortKey: number, id: string): string {
  return Buffer.from(`${radius}:${tierRank}:${sortKey}:${id}`).toString('base64url');
}
function decodeBlendCursor(c: string): BlendCursor | null {
  try {
    const [radius, tierRank, sortKey, id] = Buffer.from(c, 'base64url').toString('utf8').split(':');
    if (!id) return null;
    return { radius: Number(radius), tierRank: Number(tierRank), sortKey: Number(sortKey), id };
  } catch { return null; }
}
```

In `deal.mapper.ts`, add to `NearbyRow`: `tier_rank: number; feed_tier: string;` (already added `source_trust`, `moderation_status`, `status`, `confidence_score` in Task 1.4).

- [ ] **Step 5: Run it (passes) + build** — `cd backend && pnpm jest feeds.service && pnpm build` → PASS / OK.

- [ ] **Step 6: Commit**

```bash
git add backend/src/feeds/feeds.service.ts backend/src/feeds/feeds.service.spec.ts backend/src/deals/deal.dto.ts backend/src/deals/deal.mapper.ts
git commit -m "feat(backend): never-empty tiered Nearby blend (verified>curated>online)"
```

---

### Task 4.2: Online blend fallback + never-empty guarantee test

**Files:**
- Modify: `src/feeds/feeds.service.ts` (online blend step)
- Test: `src/feeds/feeds.service.spec.ts`

**Interfaces:**
- Consumes: existing `online()` query; the blend ladder from Task 4.1.
- Produces: when the physical blend (verified+curated at max radius) still yields `< limit`, `nearby()` appends ONLINE verified inventory (rank 2) so the feed is non-empty whenever any inventory exists. `blend.tiersIncluded` reflects `online` when used.

- [ ] **Step 1: Write the failing test**

```typescript
// add to src/feeds/feeds.service.spec.ts
it('falls back to ONLINE inventory when no physical deals are in range', async () => {
  // Seed an authoritative+verified ONLINE deal, no physical inventory near a remote point.
  const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });
  await prisma.$executeRawUnsafe(`
    INSERT INTO deals (id,external_id,title,merchant,category_id,status,moderation_status,
      source,source_trust,verification_status,is_online,expires_at,created_at,updated_at)
    VALUES (gen_random_uuid(),$1,'Online Only','Web',$2,'published','approved',
      'seed','authoritative','verified',true,now()+interval '7 days',now(),now())
  `, `online-${Date.now()}`, cat.id);

  const remote = { lat: 61.2181, lng: -149.9003, radiusMiles: 10, limit: 20 }; // Anchorage
  const page = await feeds.nearby(remote as any);
  expect(page.items.length).toBeGreaterThan(0);
  expect(page.blend.tiersIncluded).toContain('online');
  expect(page.items.some((d) => d.isOnline)).toBe(true);
});
```

- [ ] **Step 2: Run it (fails)** — `cd backend && pnpm jest feeds.service -t ONLINE` → FAIL (online deals have no `geog`, excluded by the physical query).

- [ ] **Step 3: Implement the online fallback**

At the end of `nearby()`, before building the response, append online inventory when the physical page is short and there's no active cursor into a physical page:

```typescript
  // Never-empty online fallback: if physical (verified+curated) inventory did not
  // fill the page, blend in verified ONLINE deals (rank 2). They carry no geog, so
  // they are queried separately and appended after the distance-ranked physical set.
  if (!cursor && page.length < limit) {
    const onlineRows = await this.prisma.deal.findMany({
      where: {
        status: 'published', sourceTrust: 'authoritative', verificationStatus: 'verified',
        isOnline: true, expiresAt: { gt: new Date() },
      },
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit - page.length,
    });
    const onlineItems = onlineRows.map((d) => mapPrismaDeal(d, null));
    const items = [...page.map(mapNearbyRow), ...onlineItems];
    const tiersIncluded = [...new Set(items.map((d) => d.trustLevel))];
    return { items, nextCursor, coverage, blend: { radiusMilesUsed: radiusUsed, tiersIncluded } };
  }
```

> Import `mapPrismaDeal` in `feeds.service.ts` (already exported from `deal.mapper.ts`). Online deals are appended only on page 1; deep pagination stays within the physical keyset (online inventory is bounded and recency-stable).

- [ ] **Step 4: Run it (passes) + full feeds suite** — `cd backend && pnpm jest src/feeds && pnpm build` → PASS / OK.

- [ ] **Step 5: Commit**

```bash
git add backend/src/feeds/feeds.service.ts backend/src/feeds/feeds.service.spec.ts
git commit -m "feat(backend): online-inventory fallback completes never-empty guarantee"
```

---

### Task 4.3: Docs + full regression

**Files:**
- Modify: `backend/docs/providers.md`, `backend/docs/data-model.md`, `README.md`

**Interfaces:** none (documentation + verification).

- [ ] **Step 1: Document the crawler + tiers**

Add to `backend/docs/providers.md`: the crawler as an `editorial`-trust, production-intended source gated by moderation; the auto-publish env knobs; robots.txt as a fast-follow. Add to `backend/docs/data-model.md`: the derived `feed_tier`, `confidence_score`, `crawl_source_id`, and the `crawl_*` tables. Update `README.md`'s "Future backend integration points" to note CURATED inventory now blends into Nearby with honest badges.

- [ ] **Step 2: Run the entire backend suite**

Run: `cd backend && pnpm build && pnpm jest`
Expected: full suite PASS (colima DB up). Investigate any pre-existing failures separately.

- [ ] **Step 3: Smoke the CLI against a seeded source (optional, requires DB)**

```bash
cd backend
# Insert one CrawlSource row pointing at a JSON-LD test page, then:
pnpm crawl all
# Expect JSON summary with fetched/queued counts; the deal lands as draft/pending.
```

- [ ] **Step 4: Commit**

```bash
git add backend/docs/providers.md backend/docs/data-model.md README.md
git commit -m "docs: document curated crawler, derived feed tiers, never-empty blend"
```

---

## Self-Review

**Spec coverage:**
- Sources (restaurant/happy-hour/student/grocery/local) → `CrawlKind` enum (1.2) + extractors (2.2–2.3). ✓
- Pipeline crawl→extract→normalize→CURATED→moderation→publish → Tasks 2.2–2.6, 3.1–3.2. ✓
- Deal schema fields (title…confidence_score, trust_level) → `DealCandidate` (2.1), `DealDto.trustLevel`/`confidenceScore` (1.4). ✓
- Admin approve/reject/edit/expire → 3.1/3.2 (+ existing `expire`). ✓
- Ranking VERIFIED>CURATED>(ONLINE)>COMMUNITY → `feed-tier.ts` (1.1) + blend SQL (4.1). ✓
- Never empty + fallback ladder (expand radius → curated → online → community) → 4.1/4.2. ✓
- Adjustments: derived tier (1.1), coverage+badge honesty retained (4.1 test asserts), ONLINE tier now (1.1/4.1/4.2), auto-publish thresholds (1.3/2.6), COMMUNITY reserved (1.1 fallback only). ✓

**Type consistency:** `DealCandidate`, `RawCandidate`, `FeedTier`, `CrawlRunSummary`, `ModerationEdit`, `BlendCursor`, `NearbyRow` extensions are defined once and consumed with matching shapes. `mapNearbyRow` SELECT columns (4.1) match the `NearbyRow` fields added in 1.4. CLI/script names match `ingest` precedent.

**Placeholder scan:** no TBD/TODO; every code step shows complete code. One intentional deferral (robots.txt) is explicitly scoped as a fast-follow with a doc note, not a silent gap.

**Note for the implementer:** `ANTHROPIC_API_KEY` is added to `env.schema.ts` in Task 2.6 (referenced by `CrawlerModule`); if you prefer, fold that one-line env addition into Task 1.3 instead — either ordering works since the LLM extractor no-ops without it.
