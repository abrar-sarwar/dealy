# Cost-Efficient Discovery Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing discovery scaffolding into a working, cost-capped async pipeline where Gemini decides what to crawl, Firecrawl runs only inside hard budgets, content hashing + an AI cache eliminate redundant AI spend, high-confidence candidates promote to feed-visible deals, and a scheduled cron drives it all — with zero Firecrawl/Gemini calls in the user request path.

**Architecture:** Extend (never duplicate) the current NestJS/Prisma backend. `crawl_sources` becomes the curated-source table (new columns, not a new table). Pure decision functions (budget, URL targeting, Pro escalation, crawl prefilter) live in `src/discovery/` with unit tests. A `DiscoveryRunnerService` orchestrates `evaluateRegion → prefilter → Gemini plan (cached) → budget gate → Firecrawl scrape → content-hash skip → Gemini Flash extract (cached) → Pro escalation → persist candidates → promote high-confidence → feed`. An in-process `@nestjs/schedule` cron triggers due regions only; a `discovery:run` CLI triggers one region manually.

**Tech Stack:** NestJS, Prisma/Postgres, Zod, Jest, `@nestjs/schedule`, existing `FirecrawlService`/`GeminiService`/`PrismaService`/`SearchIndexer`, native `fetch`.

## Global Constraints

- No user request path may call Firecrawl or Gemini. Discovery runs only via cron / explicit CLI trigger.
- Gemini interprets and plans; it never discovers new domains. Sources come only from `crawl_sources`.
- Firecrawl/Gemini credentials stay server-side env vars (already enforced in `env.schema.ts`).
- Gemini Flash (`GEMINI_MODEL`) is default. Pro (`GEMINI_REASONING_MODEL`) only when `confidence < GEMINI_ESCALATION_MAX_CONFIDENCE` AND `reliabilityScore > GEMINI_ESCALATION_MIN_RELIABILITY`.
- Hard Firecrawl caps (defaults): 100 pages/day total, 10 pages/source/day, 4 runs/day. **Recrawl cap (2/day):** a source we already hold a processed content hash for (`sourceMayBeUnchanged`) may be re-fetched at most `maxRecrawlsPerDay` times after its fetches keep coming back unchanged. "Unchanged" is decided **post-fetch** (scraped hash matches the prior processed hash) and recorded on `crawl_runs.unchanged`; the pre-fetch gate only knows whether the source *might* be unchanged.
- Never crawl whole domains — only an explicit `dealUrl`, the seeded URL when its own path already looks targeted, or origin+`targetPaths` for homepage sources. A bare domain resolves to no targets (skipped).
- Reuse existing tables/services. Do NOT create a `curated_sources` table — extend `CrawlSource`. Do NOT create a parallel run-log — reuse `crawl_runs`. Budget usage is read through `FirecrawlBudgetService` in exactly one place.
- Promoted deals are `editorial` trust (`source: 'crawler'`). They surface in the ungated local feed (`/v1/feeds/local`), NOT the authoritative-gated production feed, and never carry a Verified badge — AI-extracted offers are not source-confirmed.
- TDD: write the failing test before implementation for every behavior-bearing unit.
- All new code under `backend/`. Run commands from `backend/`.

---

## File Structure

**Create:**
- `backend/src/discovery/discovery-budget.ts` — pure Firecrawl budget evaluation.
- `backend/src/discovery/discovery-budget.spec.ts`
- `backend/src/discovery/url-targeting.ts` — pure target-URL resolution (no whole-domain crawls).
- `backend/src/discovery/url-targeting.spec.ts`
- `backend/src/discovery/escalation.ts` — pure Flash→Pro decision + crawl prefilter.
- `backend/src/discovery/escalation.spec.ts`
- `backend/src/discovery/ai-cache.service.ts` — Prisma-backed AI prompt/result cache (P4).
- `backend/src/discovery/ai-cache.service.spec.ts`
- `backend/src/discovery/firecrawl-budget.service.ts` — single source of truth for `crawl_runs` usage + caps.
- `backend/src/discovery/firecrawl-budget.service.spec.ts`
- `backend/src/discovery/candidate-promotion.service.ts` — high-confidence candidate → published deal.
- `backend/src/discovery/candidate-promotion.service.spec.ts`
- `backend/src/discovery/discovery-runner.service.ts` — orchestration pipeline.
- `backend/src/discovery/discovery-runner.service.spec.ts`
- `backend/src/discovery/discovery.scheduler.ts` — `@nestjs/schedule` cron entry.
- `backend/src/discovery/discovery.cli.ts` — manual `discovery:run <region>` trigger.

**Modify:**
- `backend/prisma/schema.prisma` — `CrawlSource` columns, `CrawlRun.firecrawlPages` + `CrawlRun.unchanged`, `DealCandidate.promotedAt`.
- `backend/prisma/migrations/<new>/migration.sql` — additive ALTERs.
- `backend/prisma/seed.ts` — curated metadata + spec sources across zones.
- `backend/src/config/env.schema.ts` — budget/escalation/cron/promotion env vars.
- `backend/src/config/env.schema.spec.ts` — defaults for new vars.
- `backend/src/config/firecrawl.ts` — surface new caps.
- `backend/src/config/gemini.ts` — surface escalation thresholds.
- `backend/src/config/discovery.ts` — surface cron + target paths + publish threshold.
- `backend/src/services/gemini/gemini.service.ts` — `planCrawl()` + Pro-model `extractDeals` overload.
- `backend/src/services/gemini/gemini.types.ts` — `GeminiCrawlPlan`.
- `backend/src/discovery/discovery.module.ts` — register new providers + `ScheduleModule`.
- `backend/package.json` — add `@nestjs/schedule` + `discovery:run` script.

---

### Task 1: Curated-source schema, migration, and seed

Extend `CrawlSource` (the curated-source table — do not create `curated_sources`), add Firecrawl page + unchanged accounting to `CrawlRun`, and a `promotedAt` marker to `DealCandidate`. Seed curated metadata + the spec's grocery/student sources across zones. **Seed rule: `targetPaths` is set ONLY for homepage sources whose URL is not itself a deal page; sources whose seeded URL already points at the useful path get `targetPaths: []`** (the resolver keeps the seeded URL — see Task 4).

**Files:**
- Modify: `backend/prisma/schema.prisma:699-718` (CrawlSource), `:720-737` (CrawlRun), `:797-828` (DealCandidate)
- Create: `backend/prisma/migrations/20260625090000_curated_sources/migration.sql`
- Modify: `backend/prisma/seed.ts:40-82`
- Test: `backend/src/discovery/curated-sources.spec.ts`

**Interfaces:**
- Produces: `CrawlSource.sourceType: string`, `.dealUrl: string | null`, `.targetPaths: string[]`, `.reliabilityScore: number`, `.lastSuccessAt: Date | null`, `.averageDealsFound: number`; `CrawlRun.firecrawlPages: number`, `CrawlRun.unchanged: boolean`; `DealCandidate.promotedAt: Date | null`. Used verbatim by Tasks 4–10.

- [ ] **Step 1: Add columns to `CrawlSource`** (after `lastCrawledAt`):

```prisma
  sourceType          String     @default("merchant_site") @map("source_type")
  dealUrl             String?    @map("deal_url")
  targetPaths         String[]   @default([]) @map("target_paths")
  reliabilityScore    Int        @default(50) @map("reliability_score")
  lastSuccessAt       DateTime?  @map("last_success_at")
  averageDealsFound   Float      @default(0) @map("average_deals_found")
```

- [ ] **Step 2: Add accounting columns to `CrawlRun`** (after `failed`):

```prisma
  firecrawlPages Int     @default(0) @map("firecrawl_pages")
  unchanged      Boolean @default(false)
```

- [ ] **Step 3: Add `promotedAt` to `DealCandidate`** (after `updatedAt`):

```prisma
  promotedAt DateTime? @map("promoted_at")
```

- [ ] **Step 4: Write the migration SQL**

Create `backend/prisma/migrations/20260625090000_curated_sources/migration.sql`:

```sql
ALTER TABLE "crawl_sources" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'merchant_site';
ALTER TABLE "crawl_sources" ADD COLUMN "deal_url" TEXT;
ALTER TABLE "crawl_sources" ADD COLUMN "target_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "crawl_sources" ADD COLUMN "reliability_score" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "crawl_sources" ADD COLUMN "last_success_at" TIMESTAMP(3);
ALTER TABLE "crawl_sources" ADD COLUMN "average_deals_found" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "crawl_runs" ADD COLUMN "firecrawl_pages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crawl_runs" ADD COLUMN "unchanged" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "deal_candidates" ADD COLUMN "promoted_at" TIMESTAMP(3);

CREATE INDEX "crawl_sources_reliability_score_idx" ON "crawl_sources"("reliability_score");
CREATE INDEX "crawl_runs_unchanged_idx" ON "crawl_runs"("source_id", "unchanged", "started_at");
CREATE INDEX "deal_candidates_promoted_at_idx" ON "deal_candidates"("promoted_at");
```

- [ ] **Step 5: Generate the Prisma client**

Run: `pnpm prisma generate`
Expected: `Generated Prisma Client`, no validation errors. (If a DB is reachable: `pnpm prisma migrate dev --name curated_sources`; otherwise note the unapplied migration in Task 10.)

- [ ] **Step 6: Replace the seed source list in `seed.ts`** (lines 40-57). Note `targetPaths` is empty for sources whose URL is already a deal page, and populated only for homepage sources:

```ts
// Real curated sources for the cost-efficient discovery engine. Seeded DISABLED:
// the operator verifies each URL is live, crawlable, and permitted before
// enabling. `zoneSlug` is the region bucket. CRAWL TARGET RULES:
//   - If the seeded `url` is itself a deal page (its path already matches an
//     allowed target path), leave `targetPaths: []` — the resolver crawls the
//     seeded URL as-is.
//   - If the seeded `url` is a homepage, set `dealUrl` to the verified deals
//     page (preferred) OR `targetPaths` so the resolver builds origin+path.
//     Operators MUST confirm a homepage source's dealUrl before enabling it.
// reliabilityScore seeds at 50 and is updated by the runner from outcomes.
export const crawlSources = [
  // Grocery — weekly ads / coupons (groceries). Seeded URLs are already deal pages.
  { url: 'https://www.publix.com/savings/weekly-ad', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Publix', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.kroger.com/weeklyad', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Kroger', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.kroger.com/coupons', sourceType: 'coupon_page', kind: 'grocery_circular' as const, merchantHint: 'Kroger', defaultCategorySlug: 'groceries', zoneSlug: 'midtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.aldi.us/weekly-specials/', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Aldi', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.foodcity.com/coupons/', sourceType: 'coupon_page', kind: 'grocery_circular' as const, merchantHint: 'Food City', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.foodcity.com/weekly-ad/', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Food City', defaultCategorySlug: 'groceries', zoneSlug: 'cartersville', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  // Walmart homepage-ish — needs a targeted path (operator should confirm dealUrl).
  { url: 'https://www.walmart.com/', sourceType: 'merchant_site', kind: 'grocery_circular' as const, merchantHint: 'Walmart', defaultCategorySlug: 'groceries', zoneSlug: 'cartersville', dealUrl: null, targetPaths: ['/deals', '/offers'], crawlIntervalHours: 168 },
  // Student platforms — homepages; targetPaths build the deal path (confirm dealUrl before enabling).
  { url: 'https://www.studentbeans.com/us', sourceType: 'student_platform', kind: 'student_discount' as const, merchantHint: 'Student Beans', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gsu', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://www.myunidays.com/US/en-US', sourceType: 'student_platform', kind: 'student_discount' as const, merchantHint: 'UNiDAYS', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gt', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  // Campus dining — seeded URLs already point at /specials.
  { url: 'https://dining.gsu.edu/specials/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'Georgia State Dining', defaultCategorySlug: 'food', zoneSlug: 'gsu', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://techdining.gatech.edu/specials/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'Georgia Tech Dining', defaultCategorySlug: 'food', zoneSlug: 'gt', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://dining.kennesaw.edu/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'KSU Dining', defaultCategorySlug: 'food', zoneSlug: 'ksu', dealUrl: null, targetPaths: ['/specials', '/deals'], crawlIntervalHours: 72 },
  { url: 'https://dining.uga.edu/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'UGA Dining', defaultCategorySlug: 'food', zoneSlug: 'uga', dealUrl: null, targetPaths: ['/specials'], crawlIntervalHours: 72 },
  // Restaurants / local promos — seeded URLs already point at /restaurants, /deals, /events.
  { url: 'https://poncecitymarket.com/restaurants/', sourceType: 'merchant_site', kind: 'happy_hour' as const, merchantHint: 'Ponce City Market', defaultCategorySlug: 'food', zoneSlug: 'midtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://buckhead.com/explore/deals/', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Buckhead ATL', defaultCategorySlug: 'entertainment', zoneSlug: 'buckhead', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://discoveratlanta.com/things-to-do/deals/', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Discover Atlanta', defaultCategorySlug: 'entertainment', zoneSlug: 'downtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://beltline.org/events/', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Atlanta BeltLine', defaultCategorySlug: 'entertainment', zoneSlug: 'midtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
];
```

- [ ] **Step 7: Update `seedCrawlSources()`** (lines 59-82) to persist the new fields:

```ts
async function seedCrawlSources(): Promise<void> {
  for (const s of crawlSources) {
    await prisma.crawlSource.upsert({
      where: { url: s.url },
      // Update curatable metadata only — never silently re-enable a source the
      // operator turned on/off, and never reset reliability/bookkeeping.
      update: {
        kind: s.kind,
        sourceType: s.sourceType,
        merchantHint: s.merchantHint,
        defaultCategorySlug: s.defaultCategorySlug,
        zoneSlug: s.zoneSlug,
        dealUrl: s.dealUrl,
        targetPaths: s.targetPaths,
        crawlIntervalHours: s.crawlIntervalHours,
      },
      create: {
        url: s.url,
        kind: s.kind,
        sourceType: s.sourceType,
        merchantHint: s.merchantHint,
        defaultCategorySlug: s.defaultCategorySlug,
        zoneSlug: s.zoneSlug,
        dealUrl: s.dealUrl,
        targetPaths: s.targetPaths,
        crawlIntervalHours: s.crawlIntervalHours,
        enabled: false, // operator verifies the URL, then flips this on
      },
    });
  }
}
```

- [ ] **Step 8: Guard `main()` against import side effects**

Ensure the bottom of `seed.ts` only runs `main()` as a script (so the test in Step 9 can import `crawlSources` without opening a DB connection). If the current bottom is `main().then(...)`, wrap it:

```ts
if (require.main === module) {
  main()
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 9: Write a test that validates the seed against the resolver**

Create `backend/src/discovery/curated-sources.spec.ts` (note: this test depends on Task 4's `resolveCrawlTargets`; in subagent execution, run it after Task 4 lands, or stub the import order — list it as a cross-task check):

```ts
import { crawlSources } from '../../prisma/seed';
import { resolveCrawlTargets } from './url-targeting';

const allowed = ['/deals', '/coupons', '/promotions', '/offers', '/weekly-ad', '/student-discounts', '/events'];

describe('curated crawlSources seed', () => {
  it('covers all pilot zones', () => {
    const zones = new Set(crawlSources.map((s) => s.zoneSlug));
    for (const z of ['atlanta', 'midtown', 'buckhead', 'downtown', 'gsu', 'gt', 'ksu', 'uga', 'cartersville']) {
      expect(zones.has(z)).toBe(true);
    }
  });

  it('uses known source types', () => {
    const ok = new Set(['merchant_site', 'weekly_ad', 'coupon_page', 'student_platform']);
    for (const s of crawlSources) expect(ok.has(s.sourceType)).toBe(true);
  });

  it('every source resolves to at least one targeted (non-bare) URL', () => {
    for (const s of crawlSources) {
      const targets = resolveCrawlTargets({ websiteUrl: s.url, dealUrl: s.dealUrl, targetPaths: s.targetPaths, allowedPaths: allowed });
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) expect(t).not.toMatch(/^https?:\/\/[^/]+\/?$/); // never a bare origin
    }
  });

  it('does not synthesize a path for a URL that is already a deal page', () => {
    // Publix seeded URL is already /savings/weekly-ad — resolver must keep it verbatim.
    const publix = crawlSources.find((s) => s.merchantHint === 'Publix')!;
    expect(resolveCrawlTargets({ websiteUrl: publix.url, dealUrl: publix.dealUrl, targetPaths: publix.targetPaths, allowedPaths: allowed }))
      .toEqual(['https://www.publix.com/savings/weekly-ad']);
  });
});
```

- [ ] **Step 10: Run the test (after Task 4 is implemented)**

Run: `pnpm jest src/discovery/curated-sources.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 11: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260625090000_curated_sources backend/prisma/seed.ts backend/src/discovery/curated-sources.spec.ts
git commit -m "feat(discovery): extend crawl_sources into curated-source table + seed pilot zones"
```

---

### Task 2: Budget, escalation, promotion, and target env config

Add env vars + config accessors for hard caps, escalation thresholds, cron, target paths, and publish threshold.

**Files:**
- Modify: `backend/src/config/env.schema.ts:64-74`, `backend/src/config/env.schema.spec.ts`
- Modify: `backend/src/config/firecrawl.ts`, `backend/src/config/gemini.ts`, `backend/src/config/discovery.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `FirecrawlConfig.maxPagesPerDay/maxPagesPerSourcePerDay/maxRunsPerDay/maxRecrawlsPerDay`; `GeminiConfig.escalationMaxConfidence/escalationMinReliability`; `DiscoveryConfig.cron`, `.targetPaths: string[]`, `.publishMinConfidence: number`.

- [ ] **Step 1: Write the failing config test**

Add to `backend/src/config/env.schema.spec.ts`:

```ts
import { envSchema } from './env.schema';

describe('discovery cost env defaults', () => {
  it('applies hard Firecrawl caps, escalation, cron, and publish threshold', () => {
    const env = envSchema.parse({ DATABASE_URL: 'postgres://x' });
    expect(env.FIRECRAWL_MAX_PAGES_PER_DAY).toBe(100);
    expect(env.FIRECRAWL_MAX_PAGES_PER_SOURCE_PER_DAY).toBe(10);
    expect(env.FIRECRAWL_MAX_RUNS_PER_DAY).toBe(4);
    expect(env.FIRECRAWL_MAX_RECRAWLS_PER_DAY).toBe(2);
    expect(env.GEMINI_ESCALATION_MAX_CONFIDENCE).toBe(60);
    expect(env.GEMINI_ESCALATION_MIN_RELIABILITY).toBe(80);
    expect(env.DISCOVERY_CRON).toBe('0 */6 * * *');
    expect(env.DISCOVERY_TARGET_PATHS).toContain('/deals');
    expect(env.DISCOVERY_PUBLISH_MIN_CONFIDENCE).toBe(80);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm jest src/config/env.schema.spec.ts -t "discovery cost env defaults"`
Expected: FAIL.

- [ ] **Step 3: Add the env vars** to `env.schema.ts` (after line 66):

```ts
    FIRECRAWL_MAX_PAGES_PER_DAY: z.coerce.number().int().positive().default(100),
    FIRECRAWL_MAX_PAGES_PER_SOURCE_PER_DAY: z.coerce.number().int().positive().default(10),
    FIRECRAWL_MAX_RUNS_PER_DAY: z.coerce.number().int().positive().default(4),
    FIRECRAWL_MAX_RECRAWLS_PER_DAY: z.coerce.number().int().positive().default(2),
    GEMINI_ESCALATION_MAX_CONFIDENCE: z.coerce.number().int().min(0).max(100).default(60),
    GEMINI_ESCALATION_MIN_RELIABILITY: z.coerce.number().int().min(0).max(100).default(80),
    DISCOVERY_CRON: z.string().default('0 */6 * * *'),
    DISCOVERY_TARGET_PATHS: z
      .string()
      .default('/deals,/coupons,/promotions,/offers,/weekly-ad,/student-discounts,/events'),
    DISCOVERY_PUBLISH_MIN_CONFIDENCE: z.coerce.number().int().min(0).max(100).default(80),
```

- [ ] **Step 4: Surface in config accessors**

`firecrawl.ts` interface + return:

```ts
  maxPagesPerDay: number;
  maxPagesPerSourcePerDay: number;
  maxRunsPerDay: number;
  maxRecrawlsPerDay: number;
```
```ts
    maxPagesPerDay: config.get('FIRECRAWL_MAX_PAGES_PER_DAY', { infer: true }),
    maxPagesPerSourcePerDay: config.get('FIRECRAWL_MAX_PAGES_PER_SOURCE_PER_DAY', { infer: true }),
    maxRunsPerDay: config.get('FIRECRAWL_MAX_RUNS_PER_DAY', { infer: true }),
    maxRecrawlsPerDay: config.get('FIRECRAWL_MAX_RECRAWLS_PER_DAY', { infer: true }),
```

`gemini.ts` interface + return:

```ts
  escalationMaxConfidence: number;
  escalationMinReliability: number;
```
```ts
    escalationMaxConfidence: config.get('GEMINI_ESCALATION_MAX_CONFIDENCE', { infer: true }),
    escalationMinReliability: config.get('GEMINI_ESCALATION_MIN_RELIABILITY', { infer: true }),
```

`discovery.ts` interface + return:

```ts
  cron: string;
  targetPaths: string[];
  publishMinConfidence: number;
```
```ts
    cron: config.get('DISCOVERY_CRON', { infer: true }),
    targetPaths: config.get('DISCOVERY_TARGET_PATHS', { infer: true }).split(',').map((p) => p.trim()).filter(Boolean),
    publishMinConfidence: config.get('DISCOVERY_PUBLISH_MIN_CONFIDENCE', { infer: true }),
```

- [ ] **Step 5: Run the config test**

Run: `pnpm jest src/config/env.schema.spec.ts -t "discovery cost env defaults"`
Expected: PASS.

- [ ] **Step 6: Append the new vars to `.env.example`**

```
# Discovery cost caps
FIRECRAWL_MAX_PAGES_PER_DAY=100
FIRECRAWL_MAX_PAGES_PER_SOURCE_PER_DAY=10
FIRECRAWL_MAX_RUNS_PER_DAY=4
FIRECRAWL_MAX_RECRAWLS_PER_DAY=2
GEMINI_ESCALATION_MAX_CONFIDENCE=60
GEMINI_ESCALATION_MIN_RELIABILITY=80
DISCOVERY_CRON=0 */6 * * *
DISCOVERY_TARGET_PATHS=/deals,/coupons,/promotions,/offers,/weekly-ad,/student-discounts,/events
DISCOVERY_PUBLISH_MIN_CONFIDENCE=80
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/config backend/.env.example
git commit -m "feat(discovery): config for caps, escalation, cron, target paths, publish threshold"
```

---

### Task 3: Pure Firecrawl budget evaluation

Pure function enforcing the four caps. The recrawl cap uses `sourceMayBeUnchanged` (do we already hold a processed hash for this source) + the per-source unchanged-run count.

**Files:**
- Create: `backend/src/discovery/discovery-budget.ts`, `backend/src/discovery/discovery-budget.spec.ts`

**Interfaces:**
- Produces: `evaluateFirecrawlBudget(usage, limits, opts): BudgetDecision`; types `FirecrawlBudgetLimits`, `FirecrawlBudgetUsage` (`{ pagesToday, pagesForSourceToday, runsToday, recrawlsForSourceToday }`), `BudgetDecision`, `BudgetDenyReason`. Consumed by Tasks 7–8.

- [ ] **Step 1: Write the failing test**

Create `backend/src/discovery/discovery-budget.spec.ts`:

```ts
import { evaluateFirecrawlBudget } from './discovery-budget';

const limits = { maxPagesPerDay: 100, maxPagesPerSourcePerDay: 10, maxRunsPerDay: 4, maxRecrawlsPerDay: 2 };
const fresh = { pagesToday: 0, pagesForSourceToday: 0, runsToday: 0, recrawlsForSourceToday: 0 };

describe('evaluateFirecrawlBudget', () => {
  it('allows when under all caps', () => {
    const d = evaluateFirecrawlBudget(fresh, limits, { sourceMayBeUnchanged: false });
    expect(d.allowed).toBe(true);
    expect(d.remainingPages).toBe(10);
  });

  it('blocks on daily run cap first', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, runsToday: 4 }, limits, { sourceMayBeUnchanged: false }))
      .toEqual({ allowed: false, reason: 'daily_run_cap', remainingPages: 0 });
  });

  it('blocks on daily page cap', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, pagesToday: 100 }, limits, { sourceMayBeUnchanged: false }))
      .toEqual({ allowed: false, reason: 'daily_page_cap', remainingPages: 0 });
  });

  it('blocks on per-source page cap', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, pagesForSourceToday: 10 }, limits, { sourceMayBeUnchanged: false }))
      .toEqual({ allowed: false, reason: 'source_page_cap', remainingPages: 0 });
  });

  it('blocks recrawls once a maybe-unchanged source hit the recrawl cap', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, recrawlsForSourceToday: 2 }, limits, { sourceMayBeUnchanged: true }))
      .toEqual({ allowed: false, reason: 'recrawl_cap', remainingPages: 0 });
  });

  it('ignores the recrawl cap for sources we have no prior hash for', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, recrawlsForSourceToday: 2 }, limits, { sourceMayBeUnchanged: false }).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm jest src/discovery/discovery-budget.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `discovery-budget.ts`**

```ts
export interface FirecrawlBudgetLimits {
  maxPagesPerDay: number;
  maxPagesPerSourcePerDay: number;
  maxRunsPerDay: number;
  maxRecrawlsPerDay: number;
}

export interface FirecrawlBudgetUsage {
  pagesToday: number;
  pagesForSourceToday: number;
  runsToday: number;
  /** Today's runs for THIS source whose fetch returned unchanged content. */
  recrawlsForSourceToday: number;
}

export type BudgetDenyReason =
  | 'daily_run_cap'
  | 'daily_page_cap'
  | 'source_page_cap'
  | 'recrawl_cap';

export interface BudgetDecision {
  allowed: boolean;
  reason?: BudgetDenyReason;
  remainingPages: number;
}

/**
 * Hard cost ceiling for Firecrawl, checked cheapest-cap-first. The recrawl cap
 * only bites when `sourceMayBeUnchanged` (we already hold a processed content
 * hash for this source, so another fetch is likely to come back unchanged) AND
 * this source has already produced `maxRecrawlsPerDay` unchanged fetches today.
 * "Unchanged" itself is decided post-fetch by the runner and recorded on
 * crawl_runs.unchanged — this function only consumes the counts.
 */
export function evaluateFirecrawlBudget(
  usage: FirecrawlBudgetUsage,
  limits: FirecrawlBudgetLimits,
  opts: { sourceMayBeUnchanged: boolean },
): BudgetDecision {
  if (usage.runsToday >= limits.maxRunsPerDay)
    return { allowed: false, reason: 'daily_run_cap', remainingPages: 0 };
  if (usage.pagesToday >= limits.maxPagesPerDay)
    return { allowed: false, reason: 'daily_page_cap', remainingPages: 0 };
  if (usage.pagesForSourceToday >= limits.maxPagesPerSourcePerDay)
    return { allowed: false, reason: 'source_page_cap', remainingPages: 0 };
  if (opts.sourceMayBeUnchanged && usage.recrawlsForSourceToday >= limits.maxRecrawlsPerDay)
    return { allowed: false, reason: 'recrawl_cap', remainingPages: 0 };
  return {
    allowed: true,
    remainingPages: Math.min(
      limits.maxPagesPerDay - usage.pagesToday,
      limits.maxPagesPerSourcePerDay - usage.pagesForSourceToday,
    ),
  };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm jest src/discovery/discovery-budget.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discovery/discovery-budget.ts backend/src/discovery/discovery-budget.spec.ts
git commit -m "feat(discovery): pure Firecrawl budget evaluation with hard caps"
```

---

### Task 4: Pure URL targeting + escalation/prefilter helpers

URL targeting now **prefers a seeded URL that already looks targeted over synthesizing from `targetPaths`**, fixing the Publix-style footgun.

**Files:**
- Create: `backend/src/discovery/url-targeting.ts`, `backend/src/discovery/url-targeting.spec.ts`
- Create: `backend/src/discovery/escalation.ts`, `backend/src/discovery/escalation.spec.ts`

**Interfaces:**
- Produces: `resolveCrawlTargets(input): string[]`; `shouldEscalateToPro(input): boolean`; `shouldConsiderSource(input): boolean`. Consumed by Tasks 1, 8.

- [ ] **Step 1: Write the failing URL-targeting test**

Create `backend/src/discovery/url-targeting.spec.ts`:

```ts
import { resolveCrawlTargets } from './url-targeting';

const allowed = ['/deals', '/coupons', '/promotions', '/offers', '/weekly-ad', '/student-discounts', '/events'];

describe('resolveCrawlTargets', () => {
  it('prefers an explicit dealUrl above all else', () => {
    expect(resolveCrawlTargets({ websiteUrl: 'https://shop.com/home', dealUrl: 'https://shop.com/x/deals', targetPaths: ['/coupons'], allowedPaths: allowed }))
      .toEqual(['https://shop.com/x/deals']);
  });

  it('keeps a seeded URL whose own path already looks targeted (does NOT synthesize)', () => {
    // The footgun fix: /savings/weekly-ad must be kept verbatim, not rewritten to /weekly-ad.
    expect(resolveCrawlTargets({ websiteUrl: 'https://www.publix.com/savings/weekly-ad', dealUrl: null, targetPaths: ['/weekly-ad'], allowedPaths: allowed }))
      .toEqual(['https://www.publix.com/savings/weekly-ad']);
  });

  it('synthesizes origin+targetPaths only for a homepage source', () => {
    expect(resolveCrawlTargets({ websiteUrl: 'https://www.studentbeans.com/us', dealUrl: null, targetPaths: ['/student-discounts'], allowedPaths: allowed }))
      .toEqual(['https://www.studentbeans.com/student-discounts']);
  });

  it('drops targetPaths not in the allowlist', () => {
    expect(resolveCrawlTargets({ websiteUrl: 'https://shop.com/', dealUrl: null, targetPaths: ['/admin', '/coupons'], allowedPaths: allowed }))
      .toEqual(['https://shop.com/coupons']);
  });

  it('refuses to crawl a bare domain with no targeted path', () => {
    expect(resolveCrawlTargets({ websiteUrl: 'https://shop.com/', dealUrl: null, targetPaths: [], allowedPaths: allowed }))
      .toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm jest src/discovery/url-targeting.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `url-targeting.ts`**

```ts
/**
 * Resolve the exact URLs a source may be crawled at. Priority:
 *   1. explicit dealUrl (operator-verified deals page) — always wins;
 *   2. the seeded URL itself, IF its own path already matches an allowed target
 *      path (e.g. /savings/weekly-ad) — kept verbatim, never rewritten;
 *   3. origin + allowed targetPaths — for homepage sources only;
 *   4. otherwise [] — a bare domain is never crawled.
 * This ordering prevents rewriting a good seeded deep link (publix.com/savings/
 * weekly-ad) into a guessed shallow one (publix.com/weekly-ad).
 */
export function resolveCrawlTargets(input: {
  websiteUrl: string;
  dealUrl?: string | null;
  targetPaths?: string[];
  allowedPaths: string[];
}): string[] {
  if (input.dealUrl) return [input.dealUrl];

  const url = new URL(input.websiteUrl);
  const seededPathLooksTargeted = input.allowedPaths.some((p) => url.pathname.includes(p));
  if (seededPathLooksTargeted) return [input.websiteUrl];

  const synthesized: string[] = [];
  for (const path of input.targetPaths ?? []) {
    if (input.allowedPaths.includes(path)) synthesized.push(`${url.origin}${path}`);
  }
  return [...new Set(synthesized)];
}
```

- [ ] **Step 4: Run the URL-targeting test**

Run: `pnpm jest src/discovery/url-targeting.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing escalation test**

Create `backend/src/discovery/escalation.spec.ts`:

```ts
import { shouldEscalateToPro, shouldConsiderSource } from './escalation';

describe('shouldEscalateToPro', () => {
  const t = { maxConfidence: 60, minReliability: 80 };
  it('escalates only when confidence is low AND reliability is high', () => {
    expect(shouldEscalateToPro({ confidence: 55, reliabilityScore: 85, ...t })).toBe(true);
  });
  it('does not escalate high-confidence extractions', () => {
    expect(shouldEscalateToPro({ confidence: 75, reliabilityScore: 85, ...t })).toBe(false);
  });
  it('does not escalate low-reliability sources', () => {
    expect(shouldEscalateToPro({ confidence: 55, reliabilityScore: 70, ...t })).toBe(false);
  });
});

describe('shouldConsiderSource', () => {
  const now = new Date('2026-06-24T12:00:00Z');
  it('skips disabled sources', () => {
    expect(shouldConsiderSource({ enabled: false, lastCrawledAt: null, crawlIntervalHours: 24, now })).toBe(false);
  });
  it('considers an enabled, never-crawled source', () => {
    expect(shouldConsiderSource({ enabled: true, lastCrawledAt: null, crawlIntervalHours: 24, now })).toBe(true);
  });
  it('skips a source crawled within its interval', () => {
    expect(shouldConsiderSource({ enabled: true, lastCrawledAt: new Date('2026-06-24T06:00:00Z'), crawlIntervalHours: 24, now })).toBe(false);
  });
  it('considers a source past its interval', () => {
    expect(shouldConsiderSource({ enabled: true, lastCrawledAt: new Date('2026-06-22T06:00:00Z'), crawlIntervalHours: 24, now })).toBe(true);
  });
});
```

- [ ] **Step 6: Run it to confirm failure**

Run: `pnpm jest src/discovery/escalation.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `escalation.ts`**

```ts
/** Gemini Pro only for low-confidence extractions from reliable sources. */
export function shouldEscalateToPro(input: {
  confidence: number;
  reliabilityScore: number;
  maxConfidence: number;
  minReliability: number;
}): boolean {
  return input.confidence < input.maxConfidence && input.reliabilityScore > input.minReliability;
}

/** Cheap deterministic prefilter so Gemini is never asked to plan a source that
 *  is disabled or still inside its crawl interval. */
export function shouldConsiderSource(input: {
  enabled: boolean;
  lastCrawledAt: Date | null;
  crawlIntervalHours: number;
  now?: Date;
}): boolean {
  if (!input.enabled) return false;
  if (!input.lastCrawledAt) return true;
  const now = input.now ?? new Date();
  return now.getTime() - input.lastCrawledAt.getTime() >= input.crawlIntervalHours * 60 * 60 * 1000;
}
```

- [ ] **Step 8: Run the escalation test**

Run: `pnpm jest src/discovery/escalation.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 9: Commit**

```bash
git add backend/src/discovery/url-targeting.ts backend/src/discovery/url-targeting.spec.ts backend/src/discovery/escalation.ts backend/src/discovery/escalation.spec.ts
git commit -m "feat(discovery): URL targeting (keeps targeted seeded URLs) + Pro escalation + prefilter"
```

---

### Task 5: Gemini crawl-planning + Pro extraction overload

**Files:**
- Modify: `backend/src/services/gemini/gemini.types.ts`, `backend/src/services/gemini/gemini.service.ts:63-77`, `backend/src/services/gemini/gemini.service.spec.ts`

**Interfaces:**
- Produces: `GeminiService.planCrawl(input): Promise<GeminiCrawlPlan>`; `extractDeals(input)` accepts optional `model?: string`. Type `GeminiCrawlPlan { crawl: boolean; reason: string; priority: number }`.

- [ ] **Step 1: Add the type** to `gemini.types.ts`:

```ts
export interface GeminiCrawlPlan {
  crawl: boolean;
  reason: string;
  priority: number;
}
```

- [ ] **Step 2: Write the failing service test**

Add to `backend/src/services/gemini/gemini.service.spec.ts`:

```ts
import { GeminiService } from './gemini.service';

const cfg = { apiKey: 'k', model: 'gemini-2.5-flash', reasoningModel: 'gemini-2.5-pro', cacheTtlHours: 24, enabled: true, escalationMaxConfidence: 60, escalationMinReliability: 80 };

describe('GeminiService.planCrawl', () => {
  it('returns the structured crawl plan from Flash', async () => {
    const generateJson = jest.fn().mockResolvedValue({ crawl: true, reason: 'fresh weekly ad', priority: 8 });
    const svc = new GeminiService({ generateJson }, cfg as never);
    const plan = await svc.planCrawl({ sourceType: 'weekly_ad', url: 'https://shop.com/weekly-ad', category: 'groceries', reliabilityScore: 70, averageDealsFound: 4, lastSuccessAt: null });
    expect(plan).toEqual({ crawl: true, reason: 'fresh weekly ad', priority: 8 });
    expect(generateJson).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash' }));
  });
});

describe('GeminiService.extractDeals model override', () => {
  it('uses the provided model when escalating to Pro', async () => {
    const generateJson = jest.fn().mockResolvedValue({ deals: [] });
    const svc = new GeminiService({ generateJson }, cfg as never);
    await svc.extractDeals({ content: 'x', sourceUrl: 'https://shop.com/deals', model: 'gemini-2.5-pro' });
    expect(generateJson).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-pro' }));
  });
});
```

- [ ] **Step 3: Run it to confirm failure**

Run: `pnpm jest src/services/gemini/gemini.service.spec.ts -t "planCrawl"`
Expected: FAIL.

- [ ] **Step 4: Add `model` support to `extractDeals`** (lines 63-77):

```ts
  async extractDeals(input: {
    content: string;
    merchantHint?: string;
    sourceUrl: string;
    model?: string;
  }): Promise<GeminiDealExtraction> {
    this.assertEnabled();
    return this.client.generateJson<GeminiDealExtraction>({
      model: input.model ?? this.config.model,
      schema: dealExtractionSchema,
      prompt:
        'Extract concrete user-facing deals from the extracted page content. ' +
        'Return only offers with clear discount, promotion, or special value. ' +
        `Source URL: ${input.sourceUrl}\nMerchant hint: ${input.merchantHint ?? ''}\n\nCONTENT:\n${input.content.slice(0, 12_000)}`,
    });
  }
```

- [ ] **Step 5: Add `planCrawl`** (after `extractDeals`; import `GeminiCrawlPlan` from `./gemini.types`):

```ts
  async planCrawl(input: {
    sourceType: string;
    url: string;
    category?: string;
    reliabilityScore: number;
    averageDealsFound: number;
    lastSuccessAt: Date | null;
  }): Promise<GeminiCrawlPlan> {
    this.assertEnabled();
    return this.client.generateJson<GeminiCrawlPlan>({
      model: this.config.model,
      schema: {
        type: 'object',
        properties: { crawl: { type: 'boolean' }, reason: { type: 'string' }, priority: { type: 'number' } },
        required: ['crawl', 'reason', 'priority'],
      },
      prompt:
        'You decide whether crawling this curated source right now is worth a paid Firecrawl fetch. ' +
        'Favour sources likely to hold fresh, concrete user-facing deals; skip ones unlikely to have changed or to yield offers. ' +
        'Return crawl (boolean), reason (short), priority 1-10.\n' +
        `Source type: ${input.sourceType}\nURL: ${input.url}\nCategory: ${input.category ?? ''}\n` +
        `Reliability score (0-100): ${input.reliabilityScore}\nAverage deals found per crawl: ${input.averageDealsFound}\n` +
        `Last successful crawl: ${input.lastSuccessAt?.toISOString() ?? 'never'}`,
    });
  }
```

- [ ] **Step 6: Run the Gemini tests**

Run: `pnpm jest src/services/gemini/gemini.service.spec.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/gemini
git commit -m "feat(gemini): crawl-planning gate + model override for Pro escalation"
```

---

### Task 6: AI cache service (P4 prompt/result cache)

**Files:**
- Create: `backend/src/discovery/ai-cache.service.ts`, `backend/src/discovery/ai-cache.service.spec.ts`

**Interfaces:**
- Produces: `AiCacheService.getOrGenerate<T>(params, generate): Promise<{ value: T; cacheHit: boolean }>`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/discovery/ai-cache.service.spec.ts`:

```ts
import { AiCacheService } from './ai-cache.service';

function fakePrisma() {
  const rows = new Map<string, any>();
  return {
    rows,
    aiCache: {
      findUnique: jest.fn(async ({ where }: any) => rows.get(where.cacheKey) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const r = rows.get(where.cacheKey);
        r.hitCount += data.hitCount.increment; r.lastHitAt = data.lastHitAt; return r;
      }),
      upsert: jest.fn(async ({ where, create }: any) => {
        rows.set(where.cacheKey, { hitCount: 0, lastHitAt: null, ...create }); return rows.get(where.cacheKey);
      }),
    },
  };
}

describe('AiCacheService', () => {
  const params = { task: 'deal_extraction', model: 'gemini-2.5-flash', schemaVersion: 'v1', prompt: 'extract X' };

  it('calls the generator on a miss and stores the result', async () => {
    const prisma = fakePrisma();
    const svc = new AiCacheService(prisma as never, 24);
    const generate = jest.fn().mockResolvedValue({ deals: [1] });
    expect(await svc.getOrGenerate(params, generate)).toEqual({ value: { deals: [1] }, cacheHit: false });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(prisma.aiCache.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns the cached value without calling the generator on a fresh hit', async () => {
    const prisma = fakePrisma();
    const svc = new AiCacheService(prisma as never, 24);
    await svc.getOrGenerate(params, jest.fn().mockResolvedValue({ deals: [1] }));
    const generate = jest.fn();
    const out = await svc.getOrGenerate(params, generate);
    expect(out).toEqual({ value: { deals: [1] }, cacheHit: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it('regenerates when the cached row is expired', async () => {
    const prisma = fakePrisma();
    const svc = new AiCacheService(prisma as never, 24);
    await svc.getOrGenerate(params, jest.fn().mockResolvedValue({ v: 'old' }));
    for (const r of prisma.rows.values()) r.expiresAt = new Date(Date.now() - 1000);
    const generate = jest.fn().mockResolvedValue({ v: 'new' });
    const out = await svc.getOrGenerate(params, generate);
    expect(out).toEqual({ value: { v: 'new' }, cacheHit: false });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm jest src/discovery/ai-cache.service.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ai-cache.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { aiCacheKey, sha256 } from './discovery-cost';

export interface AiCacheParams {
  task: string;
  model: string;
  schemaVersion: string;
  prompt: string;
}

/** Prompt/result cache for Gemini (P4). Fresh hit → stored output, no model
 *  call. Miss or expired → run generate(), upsert with TTL, record hit metrics. */
@Injectable()
export class AiCacheService {
  constructor(
    private readonly prisma: Pick<PrismaService, 'aiCache'>,
    private readonly ttlHours: number,
  ) {}

  async getOrGenerate<T>(params: AiCacheParams, generate: () => Promise<T>): Promise<{ value: T; cacheHit: boolean }> {
    const cacheKey = aiCacheKey(params);
    const now = new Date();
    const existing = await this.prisma.aiCache.findUnique({ where: { cacheKey } });
    if (existing && existing.expiresAt > now) {
      await this.prisma.aiCache.update({ where: { cacheKey }, data: { hitCount: { increment: 1 }, lastHitAt: now } });
      return { value: existing.output as T, cacheHit: true };
    }
    const value = await generate();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 60 * 60 * 1000);
    const promptHash = sha256(params.prompt);
    await this.prisma.aiCache.upsert({
      where: { cacheKey },
      create: { cacheKey, task: params.task, model: params.model, schemaVersion: params.schemaVersion, promptHash, output: value as object, expiresAt },
      update: { output: value as object, expiresAt, promptHash },
    });
    return { value, cacheHit: false };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm jest src/discovery/ai-cache.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discovery/ai-cache.service.ts backend/src/discovery/ai-cache.service.spec.ts
git commit -m "feat(discovery): Prisma-backed AI prompt cache with TTL + hit metrics"
```

---

### Task 7: Firecrawl budget service (single source of truth for usage)

The ONLY place that reads `crawl_runs` usage and applies caps. The runner injects this — it does not reimplement usage counting.

**Files:**
- Create: `backend/src/discovery/firecrawl-budget.service.ts`, `backend/src/discovery/firecrawl-budget.service.spec.ts`

**Interfaces:**
- Consumes: `evaluateFirecrawlBudget` (Task 3); `PrismaService.crawlRun`; `FirecrawlBudgetLimits`.
- Produces: `FirecrawlBudgetService.check(sourceId, opts, now?): Promise<BudgetDecision>` where `opts = { sourceMayBeUnchanged: boolean }`; `FirecrawlBudgetService.usageToday(sourceId, now?): Promise<FirecrawlBudgetUsage>`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/discovery/firecrawl-budget.service.spec.ts`:

```ts
import { FirecrawlBudgetService } from './firecrawl-budget.service';

const limits = { maxPagesPerDay: 100, maxPagesPerSourcePerDay: 10, maxRunsPerDay: 4, maxRecrawlsPerDay: 2 };

function fakePrisma(o: { totalPages: number; runs: number; sourcePages: number; recrawls: number }) {
  return {
    crawlRun: {
      aggregate: jest.fn(async ({ where }: any) =>
        where?.source ? { _sum: { firecrawlPages: o.sourcePages } } : { _sum: { firecrawlPages: o.totalPages } }),
      count: jest.fn(async ({ where }: any) => (where?.unchanged ? o.recrawls : o.runs)),
    },
  };
}

describe('FirecrawlBudgetService', () => {
  it('allows when usage is under caps', async () => {
    const svc = new FirecrawlBudgetService(fakePrisma({ totalPages: 10, runs: 1, sourcePages: 2, recrawls: 0 }) as never, limits);
    expect((await svc.check('s1', { sourceMayBeUnchanged: false })).allowed).toBe(true);
  });

  it('blocks once the daily page cap is hit', async () => {
    const svc = new FirecrawlBudgetService(fakePrisma({ totalPages: 100, runs: 1, sourcePages: 2, recrawls: 0 }) as never, limits);
    expect(await svc.check('s1', { sourceMayBeUnchanged: false }))
      .toEqual({ allowed: false, reason: 'daily_page_cap', remainingPages: 0 });
  });

  it('blocks a maybe-unchanged source that hit the recrawl cap', async () => {
    const svc = new FirecrawlBudgetService(fakePrisma({ totalPages: 10, runs: 2, sourcePages: 2, recrawls: 2 }) as never, limits);
    expect(await svc.check('s1', { sourceMayBeUnchanged: true }))
      .toEqual({ allowed: false, reason: 'recrawl_cap', remainingPages: 0 });
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm jest src/discovery/firecrawl-budget.service.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `firecrawl-budget.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import {
  evaluateFirecrawlBudget,
  type BudgetDecision,
  type FirecrawlBudgetLimits,
  type FirecrawlBudgetUsage,
} from './discovery-budget';

function startOfUtcDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Single source of truth for Firecrawl usage. Reads today's counts from the
 *  existing crawl_runs ledger (reuse, not a parallel table) and applies the
 *  pure caps. recrawlsForSourceToday counts this source's runs flagged
 *  unchanged=true today. */
@Injectable()
export class FirecrawlBudgetService {
  constructor(
    private readonly prisma: Pick<PrismaService, 'crawlRun'>,
    private readonly limits: FirecrawlBudgetLimits,
  ) {}

  async usageToday(sourceId: string, now = new Date()): Promise<FirecrawlBudgetUsage> {
    const since = startOfUtcDay(now);
    const [globalPages, sourcePages, runs, recrawls] = await Promise.all([
      this.prisma.crawlRun.aggregate({ _sum: { firecrawlPages: true }, where: { startedAt: { gte: since } } }),
      this.prisma.crawlRun.aggregate({ _sum: { firecrawlPages: true }, where: { startedAt: { gte: since }, source: { id: sourceId } } }),
      this.prisma.crawlRun.count({ where: { startedAt: { gte: since } } }),
      this.prisma.crawlRun.count({ where: { startedAt: { gte: since }, source: { id: sourceId }, unchanged: true } }),
    ]);
    return {
      pagesToday: globalPages._sum.firecrawlPages ?? 0,
      pagesForSourceToday: sourcePages._sum.firecrawlPages ?? 0,
      runsToday: runs,
      recrawlsForSourceToday: recrawls,
    };
  }

  async check(sourceId: string, opts: { sourceMayBeUnchanged: boolean }, now = new Date()): Promise<BudgetDecision> {
    const usage = await this.usageToday(sourceId, now);
    return evaluateFirecrawlBudget(usage, this.limits, opts);
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm jest src/discovery/firecrawl-budget.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discovery/firecrawl-budget.service.ts backend/src/discovery/firecrawl-budget.service.spec.ts
git commit -m "feat(discovery): Firecrawl budget service as single usage source of truth"
```

---

### Task 8: Discovery runner (orchestration pipeline)

`evaluateRegion → prefilter → budget.check → Gemini plan (cached) → scrape → content-hash skip (sets unchanged) → Flash extract (cached) → Pro escalation → persist candidates`. Budget usage comes ONLY from the injected `FirecrawlBudgetService`.

**Files:**
- Create: `backend/src/discovery/discovery-runner.service.ts`, `backend/src/discovery/discovery-runner.service.spec.ts`

**Interfaces:**
- Consumes: `DiscoveryService.evaluateRegion`, `FirecrawlBudgetService.check`, `FirecrawlService.scrape`, `GeminiService.planCrawl/extractDeals`, `AiCacheService.getOrGenerate`, `resolveCrawlTargets`, `shouldConsiderSource`, `shouldEscalateToPro`, `contentHash`, `dealFingerprint`.
- Produces: `DiscoveryRunnerService.runRegion(regionSlug, now?): Promise<DiscoveryRunSummary>`; `DiscoveryRunnerConfig`; `DiscoveryRunSummary`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/discovery/discovery-runner.service.spec.ts`:

```ts
import { DiscoveryRunnerService } from './discovery-runner.service';

const cfg = {
  gemini: { model: 'flash', reasoningModel: 'pro', escalationMaxConfidence: 60, escalationMinReliability: 80 },
  targetPaths: ['/deals', '/weekly-ad', '/coupons'],
};

function deps(over: any = {}) {
  const source = {
    id: 's1', url: 'https://shop.com/weekly-ad', dealUrl: null, targetPaths: [],
    sourceType: 'weekly_ad', merchantHint: 'Shop', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta',
    reliabilityScore: 70, averageDealsFound: 2, lastSuccessAt: null, lastCrawledAt: null,
    crawlIntervalHours: 24, enabled: true, ...over.source,
  };
  return {
    source,
    prisma: {
      crawlSource: { findMany: jest.fn(async () => [source]), update: jest.fn(async () => source) },
      crawlRun: { create: jest.fn(async () => ({ id: 'run1' })), update: jest.fn(async () => ({})) },
      contentHash: { findUnique: jest.fn(async () => over.priorHash ?? null), upsert: jest.fn(async () => ({ id: 'h1' })) },
      regionalInventory: { findUnique: jest.fn(async () => ({ id: 'r1', regionSlug: 'atlanta' })) },
      dealCandidate: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 'c1' })) },
    },
    discovery: { evaluateRegion: jest.fn(async () => ({ trigger: true, reason: 'below_minimum_deals' })) },
    budget: { check: jest.fn(async () => over.budget ?? ({ allowed: true, remainingPages: 10 })) },
    firecrawl: { scrape: jest.fn(async () => ({ markdown: '20% off deli', url: source.url })) },
    gemini: {
      planCrawl: jest.fn(async () => over.plan ?? ({ crawl: true, reason: 'fresh', priority: 7 })),
      extractDeals: jest.fn(async () => ({ deals: [{ title: '20% off deli', merchant: 'Shop', category: 'groceries', discount: '20%', expiration: null, location: null, summary: 's', confidence: 90, verification_status: 'pending', verified: false }] })),
    },
    aiCache: { getOrGenerate: jest.fn(async (_p: any, gen: any) => ({ value: await gen(), cacheHit: false })) },
  };
}

function build(d: any) {
  return new DiscoveryRunnerService(d.prisma, d.discovery, d.budget, d.firecrawl, d.gemini, d.aiCache, cfg as never);
}

describe('DiscoveryRunnerService.runRegion', () => {
  it('skips entirely when the region does not need a refresh', async () => {
    const d = deps();
    d.discovery.evaluateRegion = jest.fn(async () => ({ trigger: false, reason: 'inventory_healthy' }));
    const out = await build(d).runRegion('atlanta');
    expect(out.skipped).toBe(true);
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
    expect(d.gemini.planCrawl).not.toHaveBeenCalled();
  });

  it('runs the full pipeline and persists a candidate', async () => {
    const d = deps();
    const out = await build(d).runRegion('atlanta');
    expect(d.budget.check).toHaveBeenCalledWith('s1', { sourceMayBeUnchanged: false });
    expect(d.gemini.planCrawl).toHaveBeenCalledTimes(1);
    expect(d.firecrawl.scrape).toHaveBeenCalledWith({ url: 'https://shop.com/weekly-ad' });
    expect(d.gemini.extractDeals).toHaveBeenCalledTimes(1);
    expect(d.prisma.dealCandidate.create).toHaveBeenCalledTimes(1);
    expect(out.candidatesStored).toBe(1);
  });

  it('skips Gemini and marks the run unchanged when content hash is unchanged', async () => {
    const d = deps({ priorHash: { id: 'h1', processedAt: new Date('2026-06-20') } });
    const out = await build(d).runRegion('atlanta');
    expect(d.firecrawl.scrape).toHaveBeenCalledTimes(1);
    expect(d.gemini.extractDeals).not.toHaveBeenCalled();
    expect(out.geminiSkips).toBe(1);
    expect(d.prisma.crawlRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unchanged: true }) }));
  });

  it('passes sourceMayBeUnchanged=true to the budget when a prior hash exists', async () => {
    const d = deps({ priorHash: { id: 'h1', processedAt: new Date('2026-06-20') } });
    await build(d).runRegion('atlanta');
    expect(d.budget.check).toHaveBeenCalledWith('s1', { sourceMayBeUnchanged: true });
  });

  it('does not scrape when Gemini declines the crawl', async () => {
    const d = deps({ plan: { crawl: false, reason: 'unlikely', priority: 1 } });
    await build(d).runRegion('atlanta');
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
  });

  it('does not call Gemini or scrape when the budget denies the source', async () => {
    const d = deps({ budget: { allowed: false, reason: 'source_page_cap', remainingPages: 0 } });
    await build(d).runRegion('atlanta');
    expect(d.gemini.planCrawl).not.toHaveBeenCalled();
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
  });

  it('escalates to Pro for low-confidence deals from reliable sources', async () => {
    const d = deps({ source: { reliabilityScore: 85 } });
    d.gemini.extractDeals = jest.fn()
      .mockResolvedValueOnce({ deals: [{ title: 't', merchant: 'Shop', category: 'groceries', discount: null, expiration: null, location: null, summary: 's', confidence: 40, verification_status: 'pending', verified: false }] })
      .mockResolvedValueOnce({ deals: [{ title: 't', merchant: 'Shop', category: 'groceries', discount: null, expiration: null, location: null, summary: 's', confidence: 88, verification_status: 'pending', verified: false }] });
    await build(d).runRegion('atlanta');
    expect(d.gemini.extractDeals).toHaveBeenCalledTimes(2);
    expect(d.gemini.extractDeals).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'pro' }));
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm jest src/discovery/discovery-runner.service.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `discovery-runner.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { DiscoveryService } from './discovery.service';
import type { FirecrawlBudgetService } from './firecrawl-budget.service';
import type { FirecrawlService } from '../services/firecrawl/firecrawl.service';
import type { GeminiService } from '../services/gemini/gemini.service';
import type { AiCacheService } from './ai-cache.service';
import { contentHash } from './discovery-cost';
import { resolveCrawlTargets } from './url-targeting';
import { shouldConsiderSource, shouldEscalateToPro } from './escalation';
import { dealFingerprint } from '../ingestion/normalized-deal';

export interface DiscoveryRunnerConfig {
  gemini: { model: string; reasoningModel: string; escalationMaxConfidence: number; escalationMinReliability: number };
  targetPaths: string[];
}

export interface DiscoveryRunSummary {
  regionSlug: string;
  skipped: boolean;
  reason?: string;
  sourcesConsidered: number;
  pagesFetched: number;
  geminiSkips: number;
  candidatesStored: number;
}

function startOfUtcDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class DiscoveryRunnerService {
  private readonly logger = new Logger(DiscoveryRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly budget: FirecrawlBudgetService,
    private readonly firecrawl: FirecrawlService,
    private readonly gemini: GeminiService,
    private readonly aiCache: AiCacheService,
    private readonly config: DiscoveryRunnerConfig,
  ) {}

  async runRegion(regionSlug: string, now = new Date()): Promise<DiscoveryRunSummary> {
    const summary: DiscoveryRunSummary = { regionSlug, skipped: false, sourcesConsidered: 0, pagesFetched: 0, geminiSkips: 0, candidatesStored: 0 };

    const decision = await this.discovery.evaluateRegion(regionSlug, now);
    if (!decision.trigger) return { ...summary, skipped: true, reason: decision.reason };

    const inventory = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
    const sources = await this.prisma.crawlSource.findMany({ where: { zoneSlug: regionSlug, enabled: true } });

    for (const source of sources) {
      if (!shouldConsiderSource({ enabled: source.enabled, lastCrawledAt: source.lastCrawledAt, crawlIntervalHours: source.crawlIntervalHours, now })) continue;
      summary.sourcesConsidered++;

      const targets = resolveCrawlTargets({ websiteUrl: source.url, dealUrl: source.dealUrl, targetPaths: source.targetPaths, allowedPaths: this.config.targetPaths });
      if (targets.length === 0) continue;
      const url = targets[0];

      // A prior successful crawl means we already hold a processed hash for this
      // source, so another fetch may come back unchanged — this arms the recrawl cap.
      const sourceMayBeUnchanged = !!source.lastSuccessAt;

      const gate = await this.budget.check(source.id, { sourceMayBeUnchanged }, now);
      if (!gate.allowed) { this.logger.warn({ source: source.id, reason: gate.reason }, 'discovery.budget.block'); continue; }

      // Gemini plans whether the source is worth a paid fetch (cached per source/day).
      const plan = await this.aiCache.getOrGenerate(
        { task: 'crawl_plan', model: this.config.gemini.model, schemaVersion: 'v1', prompt: `${source.id}:${startOfUtcDay(now).toISOString()}` },
        () => this.gemini.planCrawl({ sourceType: source.sourceType, url: source.url, category: source.defaultCategorySlug ?? undefined, reliabilityScore: source.reliabilityScore, averageDealsFound: source.averageDealsFound, lastSuccessAt: source.lastSuccessAt }),
      );
      if (!plan.value.crawl) continue;

      const run = await this.prisma.crawlRun.create({ data: { sourceId: source.id } });
      let pages = 0, queued = 0, unchanged = false;
      try {
        const doc = await this.firecrawl.scrape({ url });
        pages++; summary.pagesFetched++;
        const text = doc.markdown ?? '';
        const hash = contentHash(text);

        const prior = await this.prisma.contentHash.findUnique({ where: { sourceUrl_hash: { sourceUrl: url, hash } } });
        if (prior?.processedAt) {
          // Unchanged → reuse prior classification, skip Gemini entirely (P4).
          unchanged = true;
          summary.geminiSkips++;
          await this.prisma.contentHash.upsert({
            where: { sourceUrl_hash: { sourceUrl: url, hash } },
            create: { sourceUrl: url, sourceId: source.id, hash, processedAt: now },
            update: { processedAt: now },
          });
        } else {
          const extraction = await this.aiCache.getOrGenerate(
            { task: 'deal_extraction', model: this.config.gemini.model, schemaVersion: 'v1', prompt: `${url}:${hash}` },
            () => this.gemini.extractDeals({ content: text, sourceUrl: url, merchantHint: source.merchantHint ?? undefined }),
          );
          let deals = extraction.value.deals;

          const needsPro = deals.some((dl) => shouldEscalateToPro({ confidence: dl.confidence, reliabilityScore: source.reliabilityScore, maxConfidence: this.config.gemini.escalationMaxConfidence, minReliability: this.config.gemini.escalationMinReliability }));
          if (needsPro) {
            const pro = await this.gemini.extractDeals({ content: text, sourceUrl: url, merchantHint: source.merchantHint ?? undefined, model: this.config.gemini.reasoningModel });
            deals = pro.deals;
          }

          const contentHashRow = await this.prisma.contentHash.upsert({
            where: { sourceUrl_hash: { sourceUrl: url, hash } },
            create: { sourceUrl: url, sourceId: source.id, hash, processedAt: now, contentPreview: text.slice(0, 280) },
            update: { processedAt: now },
          });

          for (const dl of deals) {
            const fingerprint = dealFingerprint({ merchant: dl.merchant || source.merchantHint || 'Unknown', title: dl.title, isOnline: !dl.location, locationTags: source.zoneSlug ? [source.zoneSlug] : [], latitude: null, longitude: null, currentPriceMinor: null, categorySlug: dl.category || source.defaultCategorySlug || 'food' });
            if (await this.prisma.dealCandidate.findFirst({ where: { fingerprint } })) continue;
            await this.prisma.dealCandidate.create({
              data: {
                sourceId: source.id, sourceUrl: url, contentHashId: contentHashRow.id, regionalInventoryId: inventory?.id ?? null,
                title: dl.title, merchant: dl.merchant || source.merchantHint || 'Unknown', discount: dl.discount,
                categorySlug: dl.category || source.defaultCategorySlug || 'food', expiration: dl.expiration ? new Date(dl.expiration) : null,
                locationText: dl.location, summary: dl.summary, confidence: dl.confidence, verificationStatus: dl.verification_status, fingerprint, raw: dl as object,
              },
            });
            queued++; summary.candidatesStored++;
          }
        }

        await this.prisma.crawlRun.update({ where: { id: run.id }, data: { status: 'succeeded', fetched: pages, firecrawlPages: pages, queued, unchanged, finishedAt: now } });
        await this.prisma.crawlSource.update({
          where: { id: source.id },
          data: {
            lastCrawledAt: now, lastSuccessAt: now,
            averageDealsFound: source.averageDealsFound === 0 ? queued : source.averageDealsFound * 0.7 + queued * 0.3,
            reliabilityScore: Math.min(100, source.reliabilityScore + (queued > 0 ? 2 : 0)),
          },
        });
      } catch (err) {
        await this.prisma.crawlRun.update({ where: { id: run.id }, data: { status: 'failed', error: (err as Error).message, firecrawlPages: pages, finishedAt: now } });
        await this.prisma.crawlSource.update({ where: { id: source.id }, data: { lastCrawledAt: now, reliabilityScore: Math.max(0, source.reliabilityScore - 5) } });
        this.logger.warn({ source: source.id, err: (err as Error).message }, 'discovery.source.failed');
      }
    }

    return summary;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm jest src/discovery/discovery-runner.service.spec.ts`
Expected: PASS (7 tests). If Prisma's composite-unique input differs from `sourceUrl_hash`, match the generated client name (from `@@unique([sourceUrl, hash])`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discovery/discovery-runner.service.ts backend/src/discovery/discovery-runner.service.spec.ts
git commit -m "feat(discovery): cost-capped orchestration runner reusing the budget service"
```

---

### Task 9: Candidate promotion (high-confidence → feed-visible deal)

Promote candidates with `confidence >= DISCOVERY_PUBLISH_MIN_CONFIDENCE` (not invalid/expired, not already promoted) into published `Deal` rows so the loop is user-visible. Editorial trust — surfaces in the ungated local feed, never the Verified-gated feed. Reuses `dealFingerprint` for cross-source dedup and `SearchIndexer` for indexing.

**Files:**
- Create: `backend/src/discovery/candidate-promotion.service.ts`, `backend/src/discovery/candidate-promotion.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`dealCandidate`, `regionalInventory`, `category`, `deal`), `SearchIndexer.upsertDeals`.
- Produces: `CandidatePromotionService.promoteRegion(regionSlug, now?): Promise<{ promoted: number; skipped: number }>`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/discovery/candidate-promotion.service.spec.ts`:

```ts
import { CandidatePromotionService } from './candidate-promotion.service';

function deps(over: any = {}) {
  const candidate = {
    id: 'c1', sourceId: 'src1', sourceUrl: 'https://shop.com/deals', categorySlug: 'groceries',
    title: '20% off deli', merchant: 'Shop', summary: 's', discount: '20%', confidence: 90,
    verificationStatus: 'pending', fingerprint: 'fp1', expiration: null, locationText: null, ...over.candidate,
  };
  return {
    candidate,
    prisma: {
      regionalInventory: { findUnique: jest.fn(async () => ({ id: 'r1', regionSlug: 'atlanta' })) },
      dealCandidate: { findMany: jest.fn(async () => over.candidates ?? [candidate]), update: jest.fn(async () => ({})) },
      category: { findMany: jest.fn(async () => [{ id: 'cat-groceries', slug: 'groceries' }]) },
      deal: { findFirst: jest.fn(async () => over.existingDeal ?? null), upsert: jest.fn(async () => ({ id: 'deal1' })) },
    },
    search: { upsertDeals: jest.fn(async () => undefined) },
  };
}

function build(d: any) {
  return new CandidatePromotionService(d.prisma as never, d.search as never, 80);
}

describe('CandidatePromotionService.promoteRegion', () => {
  it('promotes a high-confidence candidate to a published deal and marks it promoted', async () => {
    const d = deps();
    const out = await build(d).promoteRegion('atlanta');
    expect(d.prisma.deal.upsert).toHaveBeenCalledTimes(1);
    const arg = d.prisma.deal.upsert.mock.calls[0][0];
    expect(arg.create).toEqual(expect.objectContaining({ status: 'published', moderationStatus: 'approved', sourceTrust: 'editorial', categoryId: 'cat-groceries' }));
    expect(d.prisma.dealCandidate.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ promotedAt: expect.any(Date) }) }));
    expect(d.search.upsertDeals).toHaveBeenCalledWith(['deal1']);
    expect(out.promoted).toBe(1);
  });

  it('does not create a duplicate deal when one with the fingerprint exists; marks candidate promoted', async () => {
    const d = deps({ existingDeal: { id: 'deal-existing' } });
    const out = await build(d).promoteRegion('atlanta');
    expect(d.prisma.deal.upsert).not.toHaveBeenCalled();
    expect(d.prisma.dealCandidate.update).toHaveBeenCalledTimes(1);
    expect(out.promoted).toBe(0);
    expect(out.skipped).toBe(1);
  });

  it('skips candidates whose category is unknown', async () => {
    const d = deps({ candidate: { categorySlug: 'mystery' } });
    const out = await build(d).promoteRegion('atlanta');
    expect(d.prisma.deal.upsert).not.toHaveBeenCalled();
    expect(out.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm jest src/discovery/candidate-promotion.service.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `candidate-promotion.service.ts`** (mirrors the `Deal` shape created in `crawler.service.ts`):

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { SearchIndexer } from '../search/search-indexer.service';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Promotes high-confidence discovery candidates into published deals. Editorial
 *  trust — these surface in the ungated local feed only, never the
 *  authoritative Verified-gated feed (AI-extracted offers are not
 *  source-confirmed). Idempotent: re-promotion is blocked by promotedAt and by
 *  cross-source fingerprint dedup against existing deals. */
@Injectable()
export class CandidatePromotionService {
  private readonly logger = new Logger(CandidatePromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchIndexer,
    private readonly minConfidence: number,
  ) {}

  async promoteRegion(regionSlug: string, now = new Date()): Promise<{ promoted: number; skipped: number }> {
    const inventory = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
    const candidates = await this.prisma.dealCandidate.findMany({
      where: {
        regionalInventoryId: inventory?.id ?? undefined,
        promotedAt: null,
        confidence: { gte: this.minConfidence },
        verificationStatus: { notIn: ['invalid', 'expired'] },
      },
    });
    const categories = new Map((await this.prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));

    const publishedIds: string[] = [];
    let promoted = 0;
    let skipped = 0;

    for (const c of candidates) {
      const categoryId = categories.get(c.categorySlug);
      if (!categoryId) { skipped++; continue; }

      if (c.fingerprint) {
        const existing = await this.prisma.deal.findFirst({ where: { fingerprint: c.fingerprint }, select: { id: true } });
        if (existing) { await this.prisma.dealCandidate.update({ where: { id: c.id }, data: { promotedAt: now } }); skipped++; continue; }
      }

      const externalId = `discovery-${c.id}`;
      const expiresAt = c.expiration && c.expiration.getTime() > now.getTime() ? c.expiration : new Date(now.getTime() + 14 * 86_400_000);
      const deal = await this.prisma.deal.upsert({
        where: { externalId },
        update: { confidenceScore: Math.round(c.confidence) },
        create: {
          externalId, title: c.title, merchant: c.merchant, categoryId,
          shortDescription: c.summary, detailedDescription: '', terms: '',
          currentPriceMinor: null, originalPriceMinor: null, currency: 'USD', dealScore: 50,
          isOnline: !c.locationText, isStudentOnly: false, couponCode: null, destinationUrl: c.sourceUrl,
          latitude: null, longitude: null, locationTags: regionSlug ? [regionSlug] : [],
          visualSeed: Math.abs(hash(externalId)) % 1000, status: 'published', moderationStatus: 'approved',
          source: 'crawler', sourceTrust: 'editorial', sourceUrl: c.sourceUrl, providerAttribution: null,
          verificationStatus: c.verificationStatus, confidenceScore: Math.round(c.confidence),
          crawlSourceId: c.sourceId, fingerprint: c.fingerprint, startAt: null, expiresAt,
        },
        select: { id: true },
      });
      await this.prisma.dealCandidate.update({ where: { id: c.id }, data: { promotedAt: now } });
      publishedIds.push(deal.id);
      promoted++;
    }

    if (publishedIds.length) {
      try { await this.search.upsertDeals(publishedIds); }
      catch (err) { this.logger.warn(`search index: ${(err as Error).message}`); }
    }
    return { promoted, skipped };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm jest src/discovery/candidate-promotion.service.spec.ts`
Expected: PASS (3 tests). Confirm `Deal.source`/`sourceTrust` accept `'crawler'`/`'editorial'` (they're used identically in `crawler.service.ts:125-126`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discovery/candidate-promotion.service.ts backend/src/discovery/candidate-promotion.service.spec.ts
git commit -m "feat(discovery): promote high-confidence candidates to feed-visible editorial deals"
```

---

### Task 10: Scheduler, CLI trigger, module wiring, verification

Wire `@nestjs/schedule` cron + a manual `discovery:run <region>` CLI, register all providers, run each region through `runRegion` then `promoteRegion`, and verify.

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/discovery/discovery.scheduler.ts`, `backend/src/discovery/discovery.cli.ts`
- Modify: `backend/src/discovery/discovery.module.ts`

**Interfaces:**
- Produces: `DiscoverySchedulerService.tick(): Promise<Array<DiscoveryRunSummary & { promoted: number }>>`.

- [ ] **Step 1: Install the scheduler**

Run: `pnpm add @nestjs/schedule`
Expected: added to `dependencies`.

- [ ] **Step 2: Add the CLI script to `package.json`** `scripts`:

```json
    "discovery:run": "ts-node -r tsconfig-paths/register src/discovery/discovery.cli.ts"
```

(Match the existing crawl/ingest script runner style in `package.json`; if the repo uses `node --loader ts-node/esm` or a compiled `dist` entry for `pnpm crawl`, mirror that exact invocation instead.)

- [ ] **Step 3: Write the scheduler**

Create `backend/src/discovery/discovery.scheduler.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env.schema';
import { discoveryConfig } from '../config/discovery';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryRunnerService, type DiscoveryRunSummary } from './discovery-runner.service';
import { CandidatePromotionService } from './candidate-promotion.service';

export type RegionOutcome = DiscoveryRunSummary & { promoted: number };

/** In-process cron. Run/page caps are enforced inside runRegion via
 *  evaluateRegion + the budget service; nothing here touches a user request. */
@Injectable()
export class DiscoverySchedulerService {
  private readonly logger = new Logger(DiscoverySchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: DiscoveryRunnerService,
    private readonly promotion: CandidatePromotionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(process.env.DISCOVERY_CRON ?? '0 */6 * * *')
  async scheduled(): Promise<void> {
    if (!discoveryConfig(this.config).crawlerEnabled) return;
    const out = await this.tick();
    this.logger.log({ regions: out.length, promoted: out.reduce((n, r) => n + r.promoted, 0) }, 'discovery.cron.tick');
  }

  async tick(): Promise<RegionOutcome[]> {
    const regions = await this.prisma.regionalInventory.findMany({ select: { regionSlug: true } });
    const out: RegionOutcome[] = [];
    for (const r of regions) {
      const summary = await this.runner.runRegion(r.regionSlug);
      const { promoted } = await this.promotion.promoteRegion(r.regionSlug);
      out.push({ ...summary, promoted });
    }
    return out;
  }
}
```

- [ ] **Step 4: Write the manual CLI**

Create `backend/src/discovery/discovery.cli.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DiscoveryRunnerService } from './discovery-runner.service';
import { CandidatePromotionService } from './candidate-promotion.service';

// Usage: pnpm discovery:run <regionSlug>   (e.g. pnpm discovery:run atlanta)
async function main(): Promise<void> {
  const regionSlug = process.argv[2];
  if (!regionSlug) throw new Error('Usage: pnpm discovery:run <regionSlug>');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const summary = await app.get(DiscoveryRunnerService).runRegion(regionSlug);
    const promotion = await app.get(CandidatePromotionService).promoteRegion(regionSlug);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ...summary, ...promotion }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: Rewrite `discovery.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import type { Env } from '../config/env.schema';
import { discoveryConfig } from '../config/discovery';
import { firecrawlConfig } from '../config/firecrawl';
import { geminiConfig } from '../config/gemini';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { SearchModule } from '../search/search.module';
import { SearchIndexer } from '../search/search-indexer.service';
import { FirecrawlModule } from '../services/firecrawl/firecrawl.module';
import { FirecrawlService } from '../services/firecrawl/firecrawl.service';
import { GeminiModule } from '../services/gemini/gemini.module';
import { GeminiService } from '../services/gemini/gemini.service';
import { DiscoveryService } from './discovery.service';
import { AiCacheService } from './ai-cache.service';
import { FirecrawlBudgetService } from './firecrawl-budget.service';
import { DiscoveryRunnerService, type DiscoveryRunnerConfig } from './discovery-runner.service';
import { CandidatePromotionService } from './candidate-promotion.service';
import { DiscoverySchedulerService } from './discovery.scheduler';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, SearchModule, FirecrawlModule, GeminiModule],
  providers: [
    DiscoveryService,
    {
      provide: AiCacheService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>) => new AiCacheService(prisma, geminiConfig(config).cacheTtlHours),
    },
    {
      provide: FirecrawlBudgetService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>) => {
        const fc = firecrawlConfig(config);
        return new FirecrawlBudgetService(prisma, { maxPagesPerDay: fc.maxPagesPerDay, maxPagesPerSourcePerDay: fc.maxPagesPerSourcePerDay, maxRunsPerDay: fc.maxRunsPerDay, maxRecrawlsPerDay: fc.maxRecrawlsPerDay });
      },
    },
    {
      provide: CandidatePromotionService,
      inject: [PrismaService, SearchIndexer, ConfigService],
      useFactory: (prisma: PrismaService, search: SearchIndexer, config: ConfigService<Env, true>) => new CandidatePromotionService(prisma, search, discoveryConfig(config).publishMinConfidence),
    },
    {
      provide: DiscoveryRunnerService,
      inject: [PrismaService, DiscoveryService, FirecrawlBudgetService, FirecrawlService, GeminiService, AiCacheService, ConfigService],
      useFactory: (prisma: PrismaService, discovery: DiscoveryService, budget: FirecrawlBudgetService, firecrawl: FirecrawlService, gemini: GeminiService, aiCache: AiCacheService, config: ConfigService<Env, true>) => {
        const gc = geminiConfig(config);
        const dc = discoveryConfig(config);
        const runnerConfig: DiscoveryRunnerConfig = {
          gemini: { model: gc.model, reasoningModel: gc.reasoningModel, escalationMaxConfidence: gc.escalationMaxConfidence, escalationMinReliability: gc.escalationMinReliability },
          targetPaths: dc.targetPaths,
        };
        return new DiscoveryRunnerService(prisma, discovery, budget, firecrawl, gemini, aiCache, runnerConfig);
      },
    },
    DiscoverySchedulerService,
  ],
  exports: [DiscoveryService, DiscoveryRunnerService, CandidatePromotionService],
})
export class DiscoveryModule {}
```

Confirm `SearchModule` exports `SearchIndexer`, and `FirecrawlModule`/`GeminiModule` export their services. If any does not, add it to that module's `exports`.

- [ ] **Step 6: Typecheck the whole backend**

Run: `pnpm tsc --noEmit` (or `pnpm build`)
Expected: no type errors.

- [ ] **Step 7: Run the discovery + config + gemini suites**

Run: `pnpm jest src/discovery src/config src/services/gemini`
Expected: all PASS, including the existing `discovery-cost.spec.ts` unchanged.

- [ ] **Step 8: Run the full unit suite**

Run: `pnpm jest`
Expected: green. Note honestly in the PR if any suite needs a live DB (colima/Postgres per the Atlanta-pilot setup) and was therefore not run.

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/src/discovery/discovery.scheduler.ts backend/src/discovery/discovery.cli.ts backend/src/discovery/discovery.module.ts
git commit -m "feat(discovery): cron + CLI trigger + module wiring (run → promote per region)"
```

---

## Self-Review Notes (coverage against the spec + review feedback)

- **Review #1 (URL footgun):** Task 4 resolver keeps a targeted seeded URL verbatim; synthesizes only for homepages. Task 1 seeds `targetPaths: []` for already-targeted URLs and a cross-checked test asserts Publix resolves to `/savings/weekly-ad`.
- **Review #2 (budget duplication):** Task 7 `FirecrawlBudgetService` is the sole usage reader; Task 8 injects `budget.check()` — no private `usageToday` in the runner.
- **Review #3 (recrawl semantics):** `unchanged` recorded post-fetch on `crawl_runs`; pre-fetch gate uses `sourceMayBeUnchanged` (= source has a prior successful crawl); recrawl cap counts this source's unchanged runs today. Renamed throughout.
- **Review #4 (disabled sources):** kept disabled (operator verifies live URLs before paid crawls) + Task 10 `discovery:run <region>` CLI for one-command proof.
- **Review #5 (no promotion):** Task 9 promotes high-confidence candidates to published editorial deals (ungated local feed), idempotent via `promotedAt` + fingerprint dedup.
- **P1–P5, P8:** as in the original plan. **P2** Gemini gate (Task 5/8), **P3** caps + targeting (Tasks 3/4/7), **P4** content-hash skip + AI cache (Tasks 6/8), **P5** Flash→Pro (Tasks 4/5/8). **P8** request path untouched.
- **Out of scope this pass (next plan):** P6 health-scoring writer (trigger already reads inventory), P9 PostHog event taxonomy + Sentry spans (failures currently logged via Nest `Logger`/existing Sentry filter), canonical cross-source merge beyond fingerprint dedup.
