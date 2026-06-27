# Campus Student-Discount Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `campusSlug` and `requiresStudentId` fields to the discovery pipeline (schema → extraction → promotion → DTO → feeds) so iOS can badge student-gated campus deals without fabricating discounts.

**Architecture:** Two new nullable/boolean columns flow from `DealCandidate` → `Deal` through every existing pipeline stage. Gemini extraction gets an extended prompt and schema; campus-zoned sources (gsu/gt/ksu/uga) auto-assign `campusSlug` even when Gemini returns null. New curated student-newspaper sources are seeded disabled with `targetPaths: ['/student-discounts']` so they resolve to non-bare URLs and pass the existing "every source resolves" test.

**Tech Stack:** NestJS, Prisma (PostgreSQL/PostGIS), Jest, raw SQL migration (no `prisma migrate dev` — migration-history drift)

## Global Constraints

- Branch: `feat/campus-lane-and-images` — commit directly, NO worktree
- `prisma migrate dev` is FORBIDDEN — apply via `prisma db execute --file … --schema prisma/schema.prisma` then `prisma migrate resolve --applied <name>` then `prisma generate`
- TDD: write the failing test first, verify it fails, implement, verify it passes
- `pnpm lint` and `pnpm typecheck` must be 0 errors after each commit
- Do NOT fake discounts — only `requiresStudentId: true` when Gemini/source clearly indicates student requirement
- DB is colima Postgres at `postgresql://dealy:dealy@localhost:5434/dealy` — DATABASE_URL in `backend/.env`

---

### Task 1: Schema + Migration — add campusSlug + requiresStudentId to DealCandidate and Deal

**Files:**
- Modify: `backend/prisma/schema.prisma` (add fields to `DealCandidate` and `Deal`)
- Create: `backend/prisma/migrations/20260624150000_campus_student_lane/migration.sql`

**Interfaces:**
- Produces: `DealCandidate.campusSlug`, `DealCandidate.requiresStudentId`, `Deal.campusSlug`, `Deal.requiresStudentId` — used by Tasks 2–5

- [ ] **Step 1: Create the migration SQL file**

Create `backend/prisma/migrations/20260624150000_campus_student_lane/migration.sql` with content:

```sql
-- Migration: campus_student_lane
-- Adds campus_slug and requires_student_id to deal_candidates and deals tables.
ALTER TABLE "deal_candidates" ADD COLUMN "campus_slug" TEXT;
ALTER TABLE "deal_candidates" ADD COLUMN "requires_student_id" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "deals" ADD COLUMN "campus_slug" TEXT;
ALTER TABLE "deals" ADD COLUMN "requires_student_id" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration against the running DB**

```bash
cd /Users/oninactive/dev/dealy/backend
npx prisma db execute \
  --file prisma/migrations/20260624150000_campus_student_lane/migration.sql \
  --schema prisma/schema.prisma
```

Expected: no error, rows 0 (DDL). If the columns already exist, the command will fail with "column already exists" — that means the migration was already applied; skip to Step 3.

- [ ] **Step 3: Mark the migration as applied in Prisma's migration history**

```bash
cd /Users/oninactive/dev/dealy/backend
npx prisma migrate resolve \
  --applied 20260624150000_campus_student_lane \
  --schema prisma/schema.prisma
```

Expected: `Prisma Migrate applied the migration '20260624150000_campus_student_lane' to the database.`

- [ ] **Step 4: Add the fields to prisma/schema.prisma in the DealCandidate model**

In `backend/prisma/schema.prisma`, find `DealCandidate` and add after `imageUrl`:

```prisma
  campusSlug         String?   @map("campus_slug")
  requiresStudentId  Boolean   @default(false) @map("requires_student_id")
```

The full `DealCandidate` model block (relevant lines around `imageUrl`):

```prisma
  imageUrl           String?   @map("image_url")
  campusSlug         String?   @map("campus_slug")
  requiresStudentId  Boolean   @default(false) @map("requires_student_id")
  createdAt          DateTime  @default(now()) @map("created_at")
```

- [ ] **Step 5: Add the fields to prisma/schema.prisma in the Deal model**

In `backend/prisma/schema.prisma`, find `Deal` and add after `imageUrl`:

```prisma
  campusSlug         String?   @map("campus_slug")
  requiresStudentId  Boolean   @default(false) @map("requires_student_id")
```

The full `Deal` model block (relevant lines around `imageUrl`):

```prisma
  imageUrl            String?          @map("image_url")
  campusSlug          String?          @map("campus_slug")
  requiresStudentId   Boolean          @default(false) @map("requires_student_id")
  crawlSourceId       String?          @map("crawl_source_id") @db.Uuid
```

- [ ] **Step 6: Regenerate the Prisma client**

```bash
cd /Users/oninactive/dev/dealy/backend
npx prisma generate
```

Expected: `✔ Generated Prisma Client`. No errors.

- [ ] **Step 7: Verify columns exist in the DB**

```bash
cd /Users/oninactive/dev/dealy/backend
npx prisma db execute \
  --schema prisma/schema.prisma \
  --stdin <<'SQL'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('deal_candidates','deals')
  AND column_name IN ('campus_slug','requires_student_id')
ORDER BY table_name, column_name;
SQL
```

Expected: 4 rows (2 tables × 2 columns), `campus_slug` nullable text, `requires_student_id` boolean NOT NULL DEFAULT false.

- [ ] **Step 8: Run typecheck to confirm schema is well-formed**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/oninactive/dev/dealy/backend
git add prisma/schema.prisma prisma/migrations/20260624150000_campus_student_lane/migration.sql
git commit -m "feat(schema): add campusSlug + requiresStudentId to DealCandidate and Deal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Gemini types + extraction schema — campus_slug + requires_student_id

**Files:**
- Modify: `backend/src/services/gemini/gemini.types.ts` (add fields to `GeminiDeal`)
- Modify: `backend/src/services/gemini/gemini.service.ts` (extend `dealExtractionSchema` + prompt)
- Modify: `backend/src/services/gemini/gemini.service.spec.ts` (assert schema fields + prompt cues)

**Interfaces:**
- Consumes: `GeminiDeal` from `gemini.types.ts`
- Produces: `GeminiDeal.campus_slug: string | null`, `GeminiDeal.requires_student_id: boolean` — used by Task 3

- [ ] **Step 1: Write the failing test in gemini.service.spec.ts**

Add a new `describe` block at the bottom of `backend/src/services/gemini/gemini.service.spec.ts`:

```typescript
describe('GeminiService.extractDeals — schema includes campus_slug + requires_student_id', () => {
  it('dealExtractionSchema includes campus_slug and requires_student_id in item properties and required', () => {
    let capturedSchema: Record<string, unknown> | undefined;
    const client = {
      generateJson: jest.fn(async (req: { schema: Record<string, unknown> }) => {
        capturedSchema = req.schema;
        return { deals: [] };
      }),
    };
    const svc = new GeminiService(client, {
      enabled: true,
      model: 'gemini-2.5-flash',
      reasoningModel: 'gemini-2.5-pro',
      cacheTtlHours: 24,
      escalationMaxConfidence: 60,
      escalationMinReliability: 80,
    });
    return svc
      .extractDeals({ content: 'x', sourceUrl: 'https://t.test/s', merchantHint: 'M' })
      .then(() => {
        const items = (capturedSchema as {
          properties: { deals: { items: { properties: Record<string, unknown>; required: string[] } } };
        }).properties.deals.items;
        expect(Object.keys(items.properties)).toContain('campus_slug');
        expect(Object.keys(items.properties)).toContain('requires_student_id');
        expect(items.required).toContain('campus_slug');
        expect(items.required).toContain('requires_student_id');
      });
  });

  it('extraction prompt instructs Gemini to detect student requirements and campus tags', async () => {
    let capturedPrompt = '';
    const client = {
      generateJson: jest.fn(async (req: { prompt: string }) => {
        capturedPrompt = req.prompt;
        return { deals: [] };
      }),
    };
    const svc = new GeminiService(client, {
      enabled: true,
      model: 'gemini-2.5-flash',
      reasoningModel: 'gemini-2.5-pro',
      cacheTtlHours: 24,
      escalationMaxConfidence: 60,
      escalationMinReliability: 80,
    });
    await svc.extractDeals({ content: 'x', sourceUrl: 'https://t.test/s' });
    expect(capturedPrompt).toContain('requires_student_id');
    expect(capturedPrompt).toContain('campus_slug');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/services/gemini/gemini.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `campus_slug` not found in schema properties/required.

- [ ] **Step 3: Add campus_slug and requires_student_id to GeminiDeal in gemini.types.ts**

In `backend/src/services/gemini/gemini.types.ts`, find `GeminiDeal` and add two fields:

```typescript
export interface GeminiDeal {
  title: string;
  merchant: string;
  category: string;
  discount: string | null;
  expiration: string | null;
  location: string | null;
  summary: string;
  confidence: number;
  verification_status: 'pending' | 'verified' | 'unreachable' | 'invalid' | 'expired';
  verified: boolean;
  image_url: string | null;
  campus_slug: string | null;
  requires_student_id: boolean;
}
```

- [ ] **Step 4: Extend dealExtractionSchema in gemini.service.ts**

In `backend/src/services/gemini/gemini.service.ts`, add to the `properties` object inside the `items` object (after `image_url`):

```typescript
          campus_slug: { type: ['string', 'null'] },
          requires_student_id: { type: 'boolean' },
```

And add both to the `required` array inside `items` (after `'image_url'`):

```typescript
          'campus_slug',
          'requires_student_id',
```

The final `required` array should be:
```typescript
        required: [
          'title',
          'merchant',
          'category',
          'discount',
          'expiration',
          'location',
          'summary',
          'confidence',
          'verification_status',
          'verified',
          'image_url',
          'campus_slug',
          'requires_student_id',
        ],
```

- [ ] **Step 5: Extend the extraction prompt in gemini.service.ts**

In `backend/src/services/gemini/gemini.service.ts`, update the `extractDeals` prompt to append student-detection instructions. Replace the existing `prompt:` string:

```typescript
      prompt:
        'Extract concrete user-facing deals from the extracted page content. ' +
        'Return only offers with clear discount, promotion, or special value. ' +
        'For each deal set image_url to the single most relevant product / food / ' +
        'merchant image for that specific deal — an absolute https image URL that ' +
        'appears in the page content (e.g. a markdown image). Prefer a real product ' +
        'or food photo over a logo/banner; use null if the page has no suitable image. ' +
        'Set requires_student_id true when the offer is for students / requires a student ' +
        "ID / mentions '.edu', 'student', 'with valid student ID', 'campus'. " +
        'Set campus_slug to one of gsu, gt, ksu, uga when the deal is clearly tied to ' +
        'that campus, else null. ' +
        `Source URL: ${input.sourceUrl}\nMerchant hint: ${input.merchantHint ?? ''}\n\nCONTENT:\n${input.content.slice(0, 12_000)}`,
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/services/gemini/gemini.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS, all tests green.

- [ ] **Step 7: Run lint + typecheck**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm lint && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/oninactive/dev/dealy/backend
git add src/services/gemini/gemini.types.ts src/services/gemini/gemini.service.ts src/services/gemini/gemini.service.spec.ts
git commit -m "feat(gemini): extend extraction schema with campus_slug + requires_student_id

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Discovery Runner — persist campusSlug + requiresStudentId on DealCandidate

**Files:**
- Modify: `backend/src/discovery/discovery-runner.service.ts` (add CAMPUS_ZONES constant + fields in `dealCandidate.create`)
- Modify: `backend/src/discovery/discovery-runner.service.spec.ts` (add campus-lane tests)

**Interfaces:**
- Consumes: `GeminiDeal.campus_slug`, `GeminiDeal.requires_student_id` (Task 2); `DealCandidate.campusSlug`, `DealCandidate.requiresStudentId` (Task 1)
- Produces: `DealCandidate` rows with `campusSlug` and `requiresStudentId` — consumed by Task 4

- [ ] **Step 1: Write the failing tests in discovery-runner.service.spec.ts**

Add to the end of the existing `describe('DiscoveryRunnerService.runRegion', ...)` block in `backend/src/discovery/discovery-runner.service.spec.ts`:

```typescript
  it('sets campusSlug from zoneSlug when zoneSlug is a campus zone and Gemini returns null', async () => {
    const d = deps({ source: { zoneSlug: 'gsu' } });
    d.gemini.extractDeals = jest.fn(async () => ({
      deals: [
        {
          title: 'Student Pizza Deal',
          merchant: 'Rosa',
          category: 'food',
          discount: '20%',
          expiration: null,
          location: null,
          summary: 's',
          confidence: 90,
          verification_status: 'pending' as const,
          verified: false,
          image_url: null,
          campus_slug: null,
          requires_student_id: true,
        },
      ],
    }));
    await build(d).runRegion('gsu');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { campusSlug: string | null; requiresStudentId: boolean } },
      ]
    )[0];
    expect(arg.data.campusSlug).toBe('gsu');
    expect(arg.data.requiresStudentId).toBe(true);
  });

  it('uses Gemini campus_slug over zoneSlug default when both are present', async () => {
    const d = deps({ source: { zoneSlug: 'gsu' } });
    d.gemini.extractDeals = jest.fn(async () => ({
      deals: [
        {
          title: 'Tech Student Deal',
          merchant: 'BestBuy',
          category: 'tech',
          discount: '10%',
          expiration: null,
          location: null,
          summary: 's',
          confidence: 90,
          verification_status: 'pending' as const,
          verified: false,
          image_url: null,
          campus_slug: 'gt',
          requires_student_id: true,
        },
      ],
    }));
    await build(d).runRegion('gsu');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { campusSlug: string | null } },
      ]
    )[0];
    expect(arg.data.campusSlug).toBe('gt');
  });

  it('leaves campusSlug null for non-campus zones even when Gemini returns null', async () => {
    const d = deps({ source: { zoneSlug: 'midtown' } });
    d.gemini.extractDeals = jest.fn(async () => ({
      deals: [
        {
          title: 'Pizza Deal',
          merchant: 'PizzaPlus',
          category: 'food',
          discount: '10%',
          expiration: null,
          location: null,
          summary: 's',
          confidence: 90,
          verification_status: 'pending' as const,
          verified: false,
          image_url: null,
          campus_slug: null,
          requires_student_id: false,
        },
      ],
    }));
    await build(d).runRegion('midtown');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { campusSlug: string | null; requiresStudentId: boolean } },
      ]
    )[0];
    expect(arg.data.campusSlug).toBeNull();
    expect(arg.data.requiresStudentId).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery/discovery-runner.service.spec.ts --no-coverage 2>&1 | tail -15
```

Expected: FAIL — `campusSlug` not found on the created candidate.

- [ ] **Step 3: Add CAMPUS_ZONES constant to discovery-runner.service.ts**

In `backend/src/discovery/discovery-runner.service.ts`, add this module-level constant directly after the `isGeminiQuotaExhausted` function (before the `@Injectable()` class decorator):

```typescript
/** Campus zone slugs — a source whose zoneSlug is one of these auto-tags its
 *  deals with that campus even when Gemini returns campus_slug null. */
const CAMPUS_ZONES = new Set(['gsu', 'gt', 'ksu', 'uga']);
```

- [ ] **Step 4: Add campusSlug + requiresStudentId to dealCandidate.create in discovery-runner.service.ts**

In `backend/src/discovery/discovery-runner.service.ts`, inside the `await this.prisma.dealCandidate.create({ data: { ... } })` call, add after `imageUrl: validImageUrl(dl.image_url) ?? ogImageUrl,`:

```typescript
                requiresStudentId: dl.requires_student_id ?? false,
                campusSlug: dl.campus_slug ?? (CAMPUS_ZONES.has(source.zoneSlug ?? '') ? source.zoneSlug : null),
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery/discovery-runner.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS, all tests green.

- [ ] **Step 6: Update the existing runner spec's mock GeminiDeal shape**

The existing runner spec's `gemini.extractDeals` mock returns a `GeminiDeal` object that now needs `campus_slug` and `requires_student_id`. Without updating the mock, TypeScript will not complain (it's `jest.fn()`), but `dl.requires_student_id ?? false` will correctly default to `false`. However, for test clarity, update the mock deal in the `deps()` function to include these fields:

In `backend/src/discovery/discovery-runner.service.spec.ts`, find the `deps()` function and its default `extractDeals` mock:

```typescript
    gemini: {
      planCrawl: jest.fn(async () => over.plan ?? { crawl: true, reason: 'fresh', priority: 7 }),
      extractDeals: jest.fn(async () => ({
        deals: [
          {
            title: '20% off deli',
            merchant: 'Shop',
            category: 'groceries',
            discount: '20%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending',
            verified: false,
          },
        ],
      })),
    },
```

Replace with:

```typescript
    gemini: {
      planCrawl: jest.fn(async () => over.plan ?? { crawl: true, reason: 'fresh', priority: 7 }),
      extractDeals: jest.fn(async () => ({
        deals: [
          {
            title: '20% off deli',
            merchant: 'Shop',
            category: 'groceries',
            discount: '20%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending',
            verified: false,
            image_url: null,
            campus_slug: null,
            requires_student_id: false,
          },
        ],
      })),
    },
```

Also update the grocery circular test and escalation test mocks similarly (add `image_url: null, campus_slug: null, requires_student_id: false` to each mock deal object that doesn't already have it).

- [ ] **Step 7: Run lint + typecheck**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm lint && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 8: Run all discovery tests green**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery --no-coverage 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/oninactive/dev/dealy/backend
git add src/discovery/discovery-runner.service.ts src/discovery/discovery-runner.service.spec.ts
git commit -m "feat(runner): persist campusSlug + requiresStudentId on DealCandidate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Candidate Promotion — carry campusSlug + requiresStudentId into Deal

**Files:**
- Modify: `backend/src/discovery/candidate-promotion.service.ts` (add fields to deal.upsert create block)
- Modify: `backend/src/discovery/candidate-promotion.service.spec.ts` (assert fields flow through)

**Interfaces:**
- Consumes: `DealCandidate.campusSlug`, `DealCandidate.requiresStudentId` (Task 1)
- Produces: `Deal.campusSlug`, `Deal.requiresStudentId` — consumed by Tasks 5 and 7

- [ ] **Step 1: Write the failing test in candidate-promotion.service.spec.ts**

Add to the `Candidate` type and `deps()` function in `backend/src/discovery/candidate-promotion.service.spec.ts`:

In the `Candidate` type, add:
```typescript
  campusSlug: string | null;
  requiresStudentId: boolean;
```

In `deps()`, in the `candidate` default object, add:
```typescript
    campusSlug: null,
    requiresStudentId: false,
```

Then add a new test inside `describe('CandidatePromotionService.promoteRegion', ...)`:

```typescript
  it('carries campusSlug and requiresStudentId from the candidate to the created deal', async () => {
    const d = deps({ candidate: { campusSlug: 'gsu', requiresStudentId: true } });
    await build(d).promoteRegion('atlanta');
    const arg = (
      d.prisma.deal.upsert.mock.calls[0] as unknown as [{ create: Record<string, unknown> }]
    )[0];
    expect(arg.create).toEqual(
      expect.objectContaining({
        campusSlug: 'gsu',
        requiresStudentId: true,
      }),
    );
  });

  it('carries null campusSlug and false requiresStudentId when candidate has no campus', async () => {
    const d = deps({ candidate: { campusSlug: null, requiresStudentId: false } });
    await build(d).promoteRegion('atlanta');
    const arg = (
      d.prisma.deal.upsert.mock.calls[0] as unknown as [{ create: Record<string, unknown> }]
    )[0];
    expect(arg.create).toEqual(
      expect.objectContaining({
        campusSlug: null,
        requiresStudentId: false,
      }),
    );
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery/candidate-promotion.service.spec.ts --no-coverage 2>&1 | tail -15
```

Expected: FAIL — `campusSlug` not in the upsert create block.

- [ ] **Step 3: Add campusSlug + requiresStudentId to candidate-promotion.service.ts**

In `backend/src/discovery/candidate-promotion.service.ts`, inside the `deal.upsert` call's `create` block, add after `imageUrl: c.imageUrl,`:

```typescript
          campusSlug: c.campusSlug,
          requiresStudentId: c.requiresStudentId,
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery/candidate-promotion.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run lint + typecheck**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm lint && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/oninactive/dev/dealy/backend
git add src/discovery/candidate-promotion.service.ts src/discovery/candidate-promotion.service.spec.ts
git commit -m "feat(promotion): carry campusSlug + requiresStudentId from candidate to deal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: DTO + Mapper + Feeds — expose campusSlug + requiresStudentId in API responses

**Files:**
- Modify: `backend/src/deals/deal.dto.ts` (add fields to `DealDto`)
- Modify: `backend/src/deals/deal.mapper.ts` (add to `NormalizedDeal`, `NearbyRow`, all three mapper paths)
- Modify: `backend/src/feeds/feeds.service.ts` (add columns to SELECT in `local` and `missed` queries)

**Interfaces:**
- Consumes: `Deal.campusSlug`, `Deal.requiresStudentId` (Tasks 1 + 4)
- Produces: `DealDto.campusSlug: string | null`, `DealDto.requiresStudentId: boolean` — iOS badge signal

- [ ] **Step 1: Add campusSlug + requiresStudentId to DealDto in deal.dto.ts**

In `backend/src/deals/deal.dto.ts`, add to the `DealDto` interface after `imageUrl`:

```typescript
  /** Campus this deal belongs to, e.g. 'gsu'. Null for non-campus deals. */
  campusSlug: string | null;
  /** True when the offer requires a valid student ID at redemption. */
  requiresStudentId: boolean;
```

- [ ] **Step 2: Add campusSlug + requiresStudentId to NormalizedDeal in deal.mapper.ts**

In `backend/src/deals/deal.mapper.ts`, add to the `NormalizedDeal` interface:

```typescript
  campusSlug: string | null;
  requiresStudentId: boolean;
```

- [ ] **Step 3: Add campusSlug + requiresStudentId to the toDealDto return value in deal.mapper.ts**

In `backend/src/deals/deal.mapper.ts`, add to the `toDealDto` return object after `imageUrl: n.imageUrl,`:

```typescript
    campusSlug: n.campusSlug,
    requiresStudentId: n.requiresStudentId,
```

- [ ] **Step 4: Add campusSlug + requiresStudentId to mapPrismaDeal in deal.mapper.ts**

In `backend/src/deals/deal.mapper.ts`, in the `mapPrismaDeal` function's `toDealDto(...)` call, add after `imageUrl: deal.imageUrl ?? null,`:

```typescript
      campusSlug: deal.campusSlug ?? null,
      requiresStudentId: deal.requiresStudentId,
```

- [ ] **Step 5: Add campus_slug + requires_student_id to NearbyRow in deal.mapper.ts**

In `backend/src/deals/deal.mapper.ts`, add to the `NearbyRow` interface after `image_url`:

```typescript
  campus_slug: string | null;
  requires_student_id: boolean;
```

- [ ] **Step 6: Add campusSlug + requiresStudentId to mapNearbyRow in deal.mapper.ts**

In `backend/src/deals/deal.mapper.ts`, in the `mapNearbyRow` function's `toDealDto(...)` call, add after `imageUrl: row.image_url,`:

```typescript
      campusSlug: row.campus_slug,
      requiresStudentId: row.requires_student_id,
```

- [ ] **Step 7: Add campus_slug + requires_student_id to the local query SELECT in feeds.service.ts**

In `backend/src/feeds/feeds.service.ts`, in the `local()` method's `$queryRaw` call, add `d.campus_slug, d.requires_student_id,` to the SELECT list. Find the line:

```typescript
             d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
             d.status, d.confidence_score, d.image_url, d.created_at, d.start_at, d.expires_at,
```

And replace with:

```typescript
             d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
             d.status, d.confidence_score, d.image_url, d.campus_slug, d.requires_student_id,
             d.created_at, d.start_at, d.expires_at,
```

- [ ] **Step 8: Add campus_slug + requires_student_id to the missed query SELECT in feeds.service.ts**

In `backend/src/feeds/feeds.service.ts`, in the `missed()` method's `$queryRaw` call, similarly add `d.campus_slug, d.requires_student_id,` to the SELECT list after `d.image_url`. Find:

```typescript
             d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
             d.status, d.confidence_score, d.image_url, d.created_at, d.start_at, d.expires_at,
```

And replace with:

```typescript
             d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
             d.status, d.confidence_score, d.image_url, d.campus_slug, d.requires_student_id,
             d.created_at, d.start_at, d.expires_at,
```

- [ ] **Step 9: Run typecheck**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm typecheck
```

Expected: 0 errors. If there are errors about missing fields in fixture objects in existing spec files, add `campusSlug: null, requiresStudentId: false` to each fixture.

- [ ] **Step 10: Run lint**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 11: Run all deals + feeds tests**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/deals src/feeds --no-coverage 2>&1 | tail -10
```

Expected: PASS. If any mapper/feed spec uses a fixture that constructs a `NormalizedDeal` or `NearbyRow` directly, add `campusSlug: null, requiresStudentId: false` (or `campus_slug: null, requires_student_id: false`) to those fixtures.

- [ ] **Step 12: Commit**

```bash
cd /Users/oninactive/dev/dealy/backend
git add src/deals/deal.dto.ts src/deals/deal.mapper.ts src/feeds/feeds.service.ts
git commit -m "feat(dto+mapper+feeds): expose campusSlug + requiresStudentId in API responses

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Seed — add disabled student-newspaper/perk sources + curated-sources spec

**Files:**
- Modify: `backend/prisma/seed.ts` (add 4 new disabled student sources)
- Modify: `backend/src/discovery/curated-sources.spec.ts` (add campus coverage test)

**Interfaces:**
- Consumes: `crawlSources` array exported from `seed.ts`
- Produces: One `student_discount` source per campus (gsu/gt/ksu/uga) verifiable by the spec

Note: The 4 new sources use `targetPaths: ['/student-discounts']` so `resolveCrawlTargets` synthesizes `${origin}/student-discounts` — satisfying the existing "every source resolves to at least one targeted (non-bare) URL" test without needing a `dealUrl`. They are seeded `enabled: false`.

- [ ] **Step 1: Write the failing test in curated-sources.spec.ts**

Add a new `describe` block at the end of `backend/src/discovery/curated-sources.spec.ts`:

```typescript
describe('campus student-discount lane sources', () => {
  it('every campus (gsu, gt, ksu, uga) has at least one student_discount source', () => {
    const campuses = ['gsu', 'gt', 'ksu', 'uga'];
    for (const campus of campuses) {
      const found = crawlSources.some(
        (s) => s.zoneSlug === campus && s.kind === 'student_discount',
      );
      expect(found).toBe(true);
    }
  });

  it('all campus student-discount newspaper sources resolve to a non-bare URL', () => {
    const studentNewspapers = crawlSources.filter(
      (s) =>
        ['gsu', 'gt', 'ksu', 'uga'].includes(s.zoneSlug) &&
        s.kind === 'student_discount' &&
        ['ksusentinel.com', 'studentcenter.gsu.edu', 'nique.net', 'redandblack.com'].some((d) =>
          s.url.includes(d),
        ),
    );
    expect(studentNewspapers.length).toBe(4);
    for (const s of studentNewspapers) {
      const targets = resolveCrawlTargets({
        websiteUrl: s.url,
        dealUrl: s.dealUrl,
        targetPaths: s.targetPaths,
        allowedPaths: allowed,
      });
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) expect(t).not.toMatch(/^https?:\/\/[^/]+\/?$/);
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery/curated-sources.spec.ts --no-coverage 2>&1 | tail -15
```

Expected: FAIL — campus student-discount newspaper sources not present.

- [ ] **Step 3: Add 4 disabled student-newspaper sources to crawlSources in seed.ts**

In `backend/prisma/seed.ts`, add the following entries to the `crawlSources` array (after the existing campus dining entries or at the end of the student-discount block):

```typescript
  // Campus student-newspaper / perk sources — seeded DISABLED.
  // NOTE: needs a verified article dealUrl before enabling; content lives in articles.
  // targetPaths: ['/student-discounts'] ensures resolveCrawlTargets returns a non-bare URL.
  { url: 'https://www.ksusentinel.com/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'KSU Sentinel', defaultCategorySlug: 'studentSupplies', zoneSlug: 'ksu', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://studentcenter.gsu.edu/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'GSU Student Center', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gsu', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://nique.net/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'GT Nique', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gt', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://www.redandblack.com/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'UGA Red & Black', defaultCategorySlug: 'studentSupplies', zoneSlug: 'uga', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery/curated-sources.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS, all tests green.

- [ ] **Step 5: Verify the existing "every source resolves to at least one targeted URL" test still passes**

The new sources have `targetPaths: ['/student-discounts']` — `resolveCrawlTargets` should synthesize `${origin}/student-discounts` which is non-bare. Confirm by reading the test output from Step 4 — this test is in the same file.

- [ ] **Step 6: Run lint + typecheck**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm lint && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/oninactive/dev/dealy/backend
git add prisma/seed.ts src/discovery/curated-sources.spec.ts
git commit -m "feat(seed): add 4 disabled campus student-newspaper sources; assert campus coverage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: E2E Test — campus fields flow end-to-end through promotion to /v1/feeds/local

**Files:**
- Modify: `backend/test/discovery-promotion.e2e-spec.ts` (add campus lane e2e test)

**Interfaces:**
- Consumes: `DealCandidate.campusSlug`, `DealCandidate.requiresStudentId` (Task 1); `Deal.campusSlug`, `Deal.requiresStudentId` (Task 4); `DealDto.campusSlug`, `DealDto.requiresStudentId` (Task 5)

- [ ] **Step 1: Add campus constants and fingerprints to the e2e spec**

In `backend/test/discovery-promotion.e2e-spec.ts`, add to the constants at the top:

```typescript
const FINGERPRINT_CAMPUS = 'e2e-promo-fingerprint-campus';
```

- [ ] **Step 2: Add cleanup for the new fingerprint**

In the `cleanup()` function (the `prisma.deal.deleteMany` and `prisma.dealCandidate.deleteMany` calls), add `FINGERPRINT_CAMPUS` to the `in` arrays:

```typescript
  async function cleanup() {
    await prisma.deal.deleteMany({
      where: { fingerprint: { in: [FINGERPRINT, FINGERPRINT_IMG, FINGERPRINT_CAMPUS] } },
    });
    await prisma.dealCandidate.deleteMany({
      where: { fingerprint: { in: [FINGERPRINT, FINGERPRINT_IMG, FINGERPRINT_CAMPUS] } },
    });
    await prisma.regionalInventory.deleteMany({ where: { regionSlug: REGION } });
  }
```

- [ ] **Step 3: Add the campus lane e2e test**

Add a new `it` block inside the existing `describe('Discovery promotion → local feed (e2e)', ...)`:

```typescript
  it('carries campusSlug and requiresStudentId from candidate through promotion to /v1/feeds/local', async () => {
    const category = await prisma.category.findFirst({ select: { slug: true } });
    expect(category).toBeTruthy();

    // Reuse the inventory created in the first test (cleanup runs in afterAll).
    const inventory = await prisma.regionalInventory.findFirst({ where: { regionSlug: REGION } });
    expect(inventory).toBeTruthy();

    await prisma.dealCandidate.create({
      data: {
        sourceUrl: 'https://example.test/e2e-campus',
        title: 'E2E Campus Student Deal',
        merchant: 'E2E Campus Merchant',
        categorySlug: category!.slug,
        locationText: 'Near GSU',
        latitude: GSU.lat + 0.01,
        longitude: GSU.lng,
        summary: 'A campus-tagged student deal.',
        confidence: 95,
        verificationStatus: 'pending',
        fingerprint: FINGERPRINT_CAMPUS,
        regionalInventoryId: inventory!.id,
        campusSlug: 'gsu',
        requiresStudentId: true,
      },
    });

    const result = await promotion.promoteRegion(REGION);
    expect(result.promoted).toBeGreaterThanOrEqual(1);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/local?lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15&limit=50`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{
      title: string;
      campusSlug: string | null;
      requiresStudentId: boolean;
    }>;
    const promoted = items.find((d) => d.title === 'E2E Campus Student Deal');
    expect(promoted).toBeTruthy();
    expect(promoted!.campusSlug).toBe('gsu');
    expect(promoted!.requiresStudentId).toBe(true);
  });
```

- [ ] **Step 4: Run the e2e spec (requires running DB + colima)**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest test/discovery-promotion.e2e-spec.ts --no-coverage --testTimeout=30000 2>&1 | tail -20
```

Expected: PASS — all 3 e2e tests green (original two + new campus test).

- [ ] **Step 5: Run lint + typecheck**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm lint && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/oninactive/dev/dealy/backend
git add test/discovery-promotion.e2e-spec.ts
git commit -m "test(e2e): campus lane — campusSlug + requiresStudentId flow through promotion to local feed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification + consolidating commit

**Files:** None new — verification only.

- [ ] **Step 1: Run all targeted test suites**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest src/discovery src/feeds src/deals src/services/gemini --no-coverage 2>&1 | tail -20
```

Expected: All PASS. Record the test count (should be 30+ tests).

- [ ] **Step 2: Run the e2e promotion spec**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm jest test/discovery-promotion.e2e-spec.ts --no-coverage --testTimeout=30000 2>&1 | tail -10
```

Expected: All 3 tests PASS.

- [ ] **Step 3: Run lint**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/oninactive/dev/dealy/backend
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Confirm branch**

```bash
git branch --show-current
```

Expected: `feat/campus-lane-and-images`

- [ ] **Step 6: Create the summary commit**

```bash
cd /Users/oninactive/dev/dealy/backend/..
git add -A
git commit -m "feat(discovery): campus student-discount lane — campusSlug + requiresStudentId fields, sources, extraction

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Note: Only commit if there are unstaged changes. Otherwise, the work is already committed in the per-task commits.
