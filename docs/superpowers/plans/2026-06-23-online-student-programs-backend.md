# Online Student Programs — Backend (3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve real, curated, link-verified national student-discount programs through a production feed path, labeled `curated` (never `verified`), with a `redemptionBrand` hint for 3b's nearby finder.

**Architecture:** A new `StudentProgramsProvider` (trust `editorial`, registered unconditionally so it's production-visible) returns a curated catalog as `NormalizedDeal`s. A new `redemptionBrand` field threads from the catalog through Prisma, ingestion, the DTO/mapper, and feeds. A `GET /v1/feeds/student` endpoint plus a nearby-feed backfill expose the curated student inventory; the daily verification sweep gains a link-liveness pass that flags (never archives) dead links.

**Tech Stack:** NestJS, TypeScript, Prisma + PostgreSQL/PostGIS, Jest (unit specs `*.spec.ts` run without a DB; `test/*.e2e-spec.ts` need the Docker/colima Postgres stack). Package manager: `pnpm`, run from `backend/`.

## Global Constraints

- **REAL DATA ONLY** — every program is real with an official https `destinationUrl`; no fabricated prices (`currentPriceMinor`/`originalPriceMinor` null for variable offers). (verbatim: "Every discount displayed must be verified.")
- **Honest trust** — curated programs derive to `curated` tier and NEVER `verified`. The Verified badge stays authoritative-only.
- **Never gates access** — student/online/national inventory is always available regardless of campus/location.
- `redemptionBrand` is set only for physical-redemption programs: Apple → `"Apple Store"`, Samsung → `"Best Buy"`, Microsoft → `"Microsoft Store"`; all others null.
- TDD, frequent commits. Unit specs first (fast, no DB); e2e for endpoints/verification.
- Run everything from `backend/`. Prisma client regen after schema change: `pnpm prisma generate`.

---

### Task 1: `redemptionBrand` on the data contract (Prisma + NormalizedDeal + ingestion upsert)

**Files:**
- Modify: `backend/prisma/schema.prisma` (Deal model)
- Modify: `backend/src/ingestion/normalized-deal.ts` (NormalizedDeal interface)
- Modify: `backend/src/ingestion/ingestion.service.ts` (`toDealData` upsert)

**Interfaces:**
- Produces: `Deal.redemptionBrand: string | null` (DB column `redemption_brand`); `NormalizedDeal.redemptionBrand: string | null`; upsert writes it.

- [ ] **Step 1: Add the Prisma column**

In `backend/prisma/schema.prisma`, in `model Deal`, add alongside `destinationUrl`:

```prisma
  redemptionBrand     String?          @map("redemption_brand")
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run (needs the dev Postgres up — `colima start` + `docker compose up -d` if not running):
```bash
cd backend && pnpm prisma migrate dev --name add_redemption_brand
```
Expected: a new `prisma/migrations/*/migration.sql` containing `ADD COLUMN "redemption_brand"`, and the client regenerates.

- [ ] **Step 3: Add the field to `NormalizedDeal`**

In `backend/src/ingestion/normalized-deal.ts`, add to the `NormalizedDeal` interface after `destinationUrl`:

```typescript
  /** Brand to search for physical redemption (e.g. "Apple Store"); null = online-only. */
  redemptionBrand: string | null;
```

- [ ] **Step 4: Write it in the ingestion upsert**

In `backend/src/ingestion/ingestion.service.ts`, in `toDealData`, add after `destinationUrl: rec.destinationUrl,`:

```typescript
      redemptionBrand: rec.redemptionBrand,
```

- [ ] **Step 5: Fix the existing EditorialProvider to satisfy the new field**

`EditorialProvider.toNormalized` (and `FixtureProvider`, `TicketmasterProvider`) now miss `redemptionBrand`. In `backend/src/ingestion/providers/editorial.provider.ts` add `redemptionBrand: null,` to the returned object. Then build to find any other providers missing it:

```bash
cd backend && pnpm exec tsc --noEmit
```
Expected: no errors. Add `redemptionBrand: null,` to every `NormalizedDeal` literal the compiler flags (fixture + ticketmaster providers).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/ingestion/normalized-deal.ts backend/src/ingestion/ingestion.service.ts backend/src/ingestion/providers
git commit -m "feat(backend): add redemptionBrand to deal contract + ingestion"
```

---

### Task 2: The curated catalog + `StudentProgramsProvider`

**Files:**
- Create: `backend/src/ingestion/providers/student-programs.ts` (catalog data)
- Create: `backend/src/ingestion/providers/student-programs.provider.ts` (provider)
- Test: `backend/src/ingestion/providers/student-programs.provider.spec.ts`

**Interfaces:**
- Consumes: `DealProvider`, `NormalizedDeal`, `redemptionBrand` (Task 1).
- Produces: `StudentProgramsProvider` (`name='student-programs'`, `trust='editorial'`), `STUDENT_PROGRAMS: StudentProgram[]`.

- [ ] **Step 1: Write the failing provider test**

```typescript
// backend/src/ingestion/providers/student-programs.provider.spec.ts
import { StudentProgramsProvider } from './student-programs.provider';

describe('StudentProgramsProvider', () => {
  const provider = new StudentProgramsProvider();

  it('is an editorial, always-available provider', () => {
    expect(provider.name).toBe('student-programs');
    expect(provider.trust).toBe('editorial');
    expect(provider.isAvailable()).toBe(true);
  });

  it('returns only real, online, student-only programs with https official URLs', async () => {
    const deals = await provider.fetch();
    expect(deals.length).toBeGreaterThanOrEqual(13);
    for (const d of deals) {
      expect(d.isOnline).toBe(true);
      expect(d.isStudentOnly).toBe(true);
      expect(d.destinationUrl).toMatch(/^https:\/\//);
      expect(d.sourceUrl).toMatch(/^https:\/\//);
      expect(d.currentPriceMinor).toBeNull();
      expect(d.originalPriceMinor).toBeNull();
      expect(d.locationTags).toEqual(['online', 'nationwide']);
      expect(d.externalId.startsWith('student-')).toBe(true);
    }
  });

  it('sets redemptionBrand only for physical-redemption programs', async () => {
    const deals = await provider.fetch();
    const withBrand = deals.filter((d) => d.redemptionBrand !== null);
    const brands = withBrand.map((d) => d.redemptionBrand).sort();
    expect(brands).toEqual(['Apple Store', 'Best Buy', 'Microsoft Store']);
  });

  it('has unique externalIds', async () => {
    const deals = await provider.fetch();
    const ids = deals.map((d) => d.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('confirms a known program and invalidates an unknown one on verify', async () => {
    const deals = await provider.fetch();
    const ok = await provider.verify({ externalId: deals[0].externalId, expiresAt: deals[0].expiresAt });
    expect(ok.status).toBe('confirmed');
    const gone = await provider.verify({ externalId: 'student-nonexistent', expiresAt: new Date(Date.now() + 1e9) });
    expect(gone.status).toBe('invalid');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && pnpm jest student-programs.provider
```
Expected: FAIL — cannot find module `./student-programs.provider`.

- [ ] **Step 3: Write the catalog**

```typescript
// backend/src/ingestion/providers/student-programs.ts
/**
 * Curated catalog of REAL national student-discount programs. There is no public
 * API that vends these, so they are hand-curated with official URLs. They ingest
 * as `editorial` trust → `curated` feed tier → never wear the Verified badge.
 * `redemptionBrand` is set only where a physical store can redeem the offer.
 */
export interface StudentProgram {
  slug: string;
  title: string;
  merchant: string;
  category: 'tech' | 'entertainment';
  shortDescription: string;
  detailedDescription: string;
  terms: string;
  url: string; // official program page (https)
  redemptionBrand: string | null;
}

export const STUDENT_PROGRAMS: StudentProgram[] = [
  {
    slug: 'apple-education',
    title: 'Apple Education Pricing',
    merchant: 'Apple',
    category: 'tech',
    shortDescription: 'Student pricing on Mac and iPad, plus AppleCare savings.',
    detailedDescription:
      'Apple offers verified students and educators special pricing on Mac and iPad, with savings on AppleCare+. Eligibility verified by Apple at checkout.',
    terms: 'Current/newly-accepted college students and educators. Verified by Apple. See official page.',
    url: 'https://www.apple.com/us-edu/store',
    redemptionBrand: 'Apple Store',
  },
  {
    slug: 'samsung-education',
    title: 'Samsung Education Offers',
    merchant: 'Samsung',
    category: 'tech',
    shortDescription: 'Student discounts on Galaxy phones, tablets, and laptops.',
    detailedDescription:
      'Samsung offers verified students additional discounts on Galaxy devices and Galaxy Books through its education store.',
    terms: 'Student eligibility verified by Samsung. See official page.',
    url: 'https://www.samsung.com/us/shop/discount-program/education/',
    redemptionBrand: 'Best Buy',
  },
  {
    slug: 'microsoft-education',
    title: 'Microsoft Student Store',
    merchant: 'Microsoft',
    category: 'tech',
    shortDescription: 'Student deals on Surface, Windows PCs, and software.',
    detailedDescription:
      'Microsoft offers eligible students discounts on Surface devices and software, plus free Office for many schools.',
    terms: 'Eligibility verified by Microsoft. See official page.',
    url: 'https://www.microsoft.com/en-us/store/b/education',
    redemptionBrand: 'Microsoft Store',
  },
  {
    slug: 'dell-student',
    title: 'Dell Student Discounts',
    merchant: 'Dell',
    category: 'tech',
    shortDescription: 'Extra savings on Dell laptops and desktops for students.',
    detailedDescription: 'Dell offers students coupons and member pricing on PCs and accessories.',
    terms: 'Student eligibility per Dell. See official page.',
    url: 'https://www.dell.com/en-us/lp/student-discounts',
    redemptionBrand: null,
  },
  {
    slug: 'lenovo-student',
    title: 'Lenovo Student Discount',
    merchant: 'Lenovo',
    category: 'tech',
    shortDescription: 'Student pricing on Lenovo laptops via verification.',
    detailedDescription: 'Lenovo offers verified students additional discounts on ThinkPad, Yoga, and Legion devices.',
    terms: 'Verified by Lenovo/partner. See official page.',
    url: 'https://www.lenovo.com/us/en/d/deals/students/',
    redemptionBrand: null,
  },
  {
    slug: 'adobe-student',
    title: 'Adobe Creative Cloud for Students',
    merchant: 'Adobe',
    category: 'tech',
    shortDescription: 'Over 60% off the Creative Cloud All Apps plan for students.',
    detailedDescription:
      'Students and teachers save substantially on the Adobe Creative Cloud All Apps plan for the first year.',
    terms: 'Eligibility verified by Adobe. See official page.',
    url: 'https://www.adobe.com/creativecloud/buy/students.html',
    redemptionBrand: null,
  },
  {
    slug: 'github-student-pack',
    title: 'GitHub Student Developer Pack',
    merchant: 'GitHub',
    category: 'tech',
    shortDescription: 'Free developer tools and credits for verified students.',
    detailedDescription:
      'The GitHub Student Developer Pack bundles free access to dozens of developer tools and cloud credits for students.',
    terms: 'Verified student status via GitHub Education. See official page.',
    url: 'https://education.github.com/pack',
    redemptionBrand: null,
  },
  {
    slug: 'jetbrains-students',
    title: 'JetBrains Free for Students',
    merchant: 'JetBrains',
    category: 'tech',
    shortDescription: 'Free JetBrains IDEs (IntelliJ, PyCharm, …) for students.',
    detailedDescription: 'Students and teachers get a free individual subscription to all JetBrains IDEs.',
    terms: 'Verified student status via JetBrains. See official page.',
    url: 'https://www.jetbrains.com/community/education/#students',
    redemptionBrand: null,
  },
  {
    slug: 'figma-education',
    title: 'Figma Education',
    merchant: 'Figma',
    category: 'tech',
    shortDescription: 'Free Figma Professional for students and educators.',
    detailedDescription: 'Eligible students and educators get Figma’s Education plan free.',
    terms: 'Verified by Figma. See official page.',
    url: 'https://www.figma.com/education/',
    redemptionBrand: null,
  },
  {
    slug: 'notion-education',
    title: 'Notion for Education',
    merchant: 'Notion',
    category: 'tech',
    shortDescription: 'Free Notion Plus plan with AI for students.',
    detailedDescription: 'Students and educators with a school email get the Notion Plus plan free.',
    terms: 'Verified by school email. See official page.',
    url: 'https://www.notion.com/product/notion-for-education',
    redemptionBrand: null,
  },
  {
    slug: 'canva-education',
    title: 'Canva for Students/Education',
    merchant: 'Canva',
    category: 'tech',
    shortDescription: 'Free Canva premium features for eligible students.',
    detailedDescription: 'Canva offers free premium access to eligible students and educators.',
    terms: 'Eligibility verified by Canva. See official page.',
    url: 'https://www.canva.com/education/',
    redemptionBrand: null,
  },
  {
    slug: 'spotify-student',
    title: 'Spotify Premium Student',
    merchant: 'Spotify',
    category: 'entertainment',
    shortDescription: 'Discounted Premium plan (with Hulu) for students.',
    detailedDescription:
      'Verified college students get Spotify Premium at a reduced monthly price, often bundled with Hulu.',
    terms: 'Verified via SheerID. Up to 4 years. See official page.',
    url: 'https://www.spotify.com/us/student/',
    redemptionBrand: null,
  },
  {
    slug: 'prime-student',
    title: 'Amazon Prime Student',
    merchant: 'Amazon',
    category: 'entertainment',
    shortDescription: '6-month free trial, then half-price Prime for students.',
    detailedDescription:
      'College students get a 6-month Prime Student trial, then Prime at 50% off, plus exclusive student deals.',
    terms: 'Verified student status. See official page.',
    url: 'https://www.amazon.com/amazonprime/student',
    redemptionBrand: null,
  },
];
```

- [ ] **Step 4: Write the provider**

```typescript
// backend/src/ingestion/providers/student-programs.provider.ts
import { Injectable } from '@nestjs/common';
import type {
  DealProvider,
  NormalizedDeal,
  VerifiableDeal,
  VerificationResult,
} from '../normalized-deal';
import { STUDENT_PROGRAMS, type StudentProgram } from './student-programs';

/** ~1 year out; curated programs are evergreen and re-checked by link liveness. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Curated provider for major national student-discount programs (Apple Education,
 * Spotify Student, GitHub Student Pack, …). TRUST: `editorial` → these derive to
 * the `curated` feed tier and NEVER wear the Verified badge. Unlike the dev-only
 * EditorialProvider, this is registered in production (real programs, official
 * URLs). `verify()` checks the curated list; link liveness is handled by the
 * verification sweep.
 */
@Injectable()
export class StudentProgramsProvider implements DealProvider {
  readonly name = 'student-programs';
  readonly trust = 'editorial' as const;

  isAvailable(): boolean {
    return true;
  }

  async fetch(): Promise<NormalizedDeal[]> {
    return STUDENT_PROGRAMS.map((p) => this.toNormalized(p));
  }

  async verify(deal: VerifiableDeal): Promise<VerificationResult> {
    const slug = deal.externalId.replace(/^student-/, '');
    const found = STUDENT_PROGRAMS.some((p) => p.slug === slug);
    return found ? { status: 'confirmed' } : { status: 'invalid', reason: 'program no longer curated' };
  }

  private toNormalized(p: StudentProgram): NormalizedDeal {
    return {
      externalId: `student-${p.slug}`,
      title: p.title,
      merchant: p.merchant,
      categorySlug: p.category,
      shortDescription: p.shortDescription,
      detailedDescription: p.detailedDescription,
      terms: p.terms,
      currentPriceMinor: null,
      originalPriceMinor: null,
      currency: 'USD',
      isOnline: true,
      isStudentOnly: true,
      couponCode: null,
      destinationUrl: p.url,
      redemptionBrand: p.redemptionBrand,
      latitude: null,
      longitude: null,
      locationTags: ['online', 'nationwide'],
      dealScore: 80,
      visualSeed: Math.abs(this.hash(p.slug)) % 1000,
      startAt: null,
      expiresAt: new Date(Date.now() + ONE_YEAR_MS),
      sourceUrl: p.url,
      providerAttribution: 'Curated by Dealy',
    };
  }

  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && pnpm jest student-programs.provider
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/ingestion/providers/student-programs.ts backend/src/ingestion/providers/student-programs.provider.ts backend/src/ingestion/providers/student-programs.provider.spec.ts
git commit -m "feat(backend): curated StudentProgramsProvider (real programs, editorial trust)"
```

---

### Task 3: Register the provider in production (registry + module)

**Files:**
- Modify: `backend/src/ingestion/provider-registry.ts`
- Modify: `backend/src/ingestion/ingestion.module.ts`
- Test: `backend/src/ingestion/provider-registry.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `StudentProgramsProvider` (Task 2).
- Produces: registry always returns `student-programs` (regardless of `fixturesEnabled`).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/ingestion/provider-registry.spec.ts
import { ConfigService } from '@nestjs/config';
import { ProviderRegistry } from './provider-registry';
import { FixtureProvider } from './providers/fixture.provider';
import { TicketmasterProvider } from './providers/ticketmaster.provider';
import { EditorialProvider } from './providers/editorial.provider';
import { StudentProgramsProvider } from './providers/student-programs.provider';

function makeRegistry(fixturesOn: boolean): ProviderRegistry {
  const config = {
    get: (key: string) => (key === 'APP_ENV' ? (fixturesOn ? 'development' : 'production') : false),
  } as unknown as ConfigService<any, true>;
  return new ProviderRegistry(
    new FixtureProvider(),
    // Ticketmaster/Editorial constructors may need args; if so, cast a stub.
    new TicketmasterProvider(config as any),
    new EditorialProvider(),
    new StudentProgramsProvider(),
    config,
  );
}

describe('ProviderRegistry', () => {
  it('always registers student-programs, even with fixtures disabled', () => {
    const reg = makeRegistry(false);
    expect(reg.get('student-programs')).toBeDefined();
    expect(reg.get('student-programs')!.trust).toBe('editorial');
  });
});
```

> NOTE: Match the real `TicketmasterProvider`/`FixtureProvider`/`EditorialProvider` constructor signatures — read each file's `constructor(...)` first and pass matching stubs/casts. The assertion under test is only about `student-programs`.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && pnpm jest provider-registry
```
Expected: FAIL — `ProviderRegistry` constructor doesn't accept a `StudentProgramsProvider`.

- [ ] **Step 3: Register in the registry**

In `backend/src/ingestion/provider-registry.ts`:
- import: `import { StudentProgramsProvider } from './providers/student-programs.provider';`
- add `studentPrograms: StudentProgramsProvider,` to the constructor params (before `config`)
- register it on the always-on line:

```typescript
    this.providers = new Map<string, DealProvider>([
      [ticketmaster.name, ticketmaster],
      [studentPrograms.name, studentPrograms],
    ]);
```

- [ ] **Step 4: Wire it into the Nest module**

In `backend/src/ingestion/ingestion.module.ts`, import `StudentProgramsProvider` and add it to the `providers` array.

- [ ] **Step 5: Run the test + build**

```bash
cd backend && pnpm jest provider-registry && pnpm exec tsc --noEmit
```
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ingestion/provider-registry.ts backend/src/ingestion/ingestion.module.ts backend/src/ingestion/provider-registry.spec.ts
git commit -m "feat(backend): register StudentProgramsProvider in production"
```

---

### Task 4: Thread `redemptionBrand` through DTO + mappers

**Files:**
- Modify: `backend/src/deals/deal.dto.ts` (`DealDto`)
- Modify: `backend/src/deals/deal.mapper.ts` (internal `NormalizedDeal`, `toDealDto`, `mapPrismaDeal`, `NearbyRow`, `mapNearbyRow`)
- Test: `backend/src/deals/deal.mapper.spec.ts` (create if absent)

**Interfaces:**
- Produces: `DealDto.redemptionBrand: string | null` populated by both mappers.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/deals/deal.mapper.spec.ts
import { mapPrismaDeal } from './deal.mapper';

function fakeDeal(over: Partial<any> = {}) {
  return {
    id: 'd1', title: 't', merchant: 'm',
    category: { slug: 'tech' },
    shortDescription: 's', detailedDescription: 'd', terms: '',
    currentPriceMinor: null, originalPriceMinor: null, currency: 'USD',
    dealScore: 80, isOnline: true, isStudentOnly: true,
    couponCode: null, destinationUrl: 'https://x', redemptionBrand: 'Apple Store',
    latitude: null, longitude: null, locationTags: ['online', 'nationwide'], visualSeed: 1,
    verificationStatus: 'pending', lastVerifiedAt: null, createdAt: new Date(), startAt: null,
    expiresAt: new Date(Date.now() + 1e9), sourceTrust: 'editorial', moderationStatus: 'approved',
    status: 'published', confidenceScore: null,
    ...over,
  };
}

describe('deal mapper redemptionBrand', () => {
  it('passes redemptionBrand through', () => {
    expect(mapPrismaDeal(fakeDeal() as any, null).redemptionBrand).toBe('Apple Store');
  });
  it('keeps null brand null', () => {
    expect(mapPrismaDeal(fakeDeal({ redemptionBrand: null }) as any, null).redemptionBrand).toBeNull();
  });
  it('curated editorial student deal derives to curated trustLevel, never verified', () => {
    const dto = mapPrismaDeal(fakeDeal() as any, null);
    expect(dto.trustLevel).toBe('curated');
    expect(dto.verified).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && pnpm jest deal.mapper
```
Expected: FAIL — `redemptionBrand` missing on `DealDto`/mapper output.

- [ ] **Step 3: Add to `DealDto`**

In `backend/src/deals/deal.dto.ts`, in `DealDto`, after `destinationUrl: string | null;`:

```typescript
  /** Brand to search for physical redemption (e.g. "Apple Store"); null = online-only. */
  redemptionBrand: string | null;
```

- [ ] **Step 4: Thread through `deal.mapper.ts`**

In `backend/src/deals/deal.mapper.ts`:
- internal `NormalizedDeal` interface: add `redemptionBrand: string | null;` (after `destinationUrl`)
- `toDealDto` return object: add `redemptionBrand: n.redemptionBrand,` (after `destinationUrl: n.destinationUrl,`)
- `mapPrismaDeal` input object: add `redemptionBrand: deal.redemptionBrand,`
- `NearbyRow` interface: add `redemption_brand: string | null;` (after `destination_url`)
- `mapNearbyRow` input object: add `redemptionBrand: row.redemption_brand,`

- [ ] **Step 5: Run the test + build**

```bash
cd backend && pnpm jest deal.mapper && pnpm exec tsc --noEmit
```
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/deals/deal.dto.ts backend/src/deals/deal.mapper.ts backend/src/deals/deal.mapper.spec.ts
git commit -m "feat(backend): thread redemptionBrand through DTO + mappers"
```

---

### Task 5: `GET /v1/feeds/student` + curated nearby backfill + SQL column

**Files:**
- Modify: `backend/src/feeds/feeds.service.ts` (add `student()`, select `d.redemption_brand`, curated backfill)
- Modify: `backend/src/feeds/feeds.controller.ts` (add `student` route)
- Test: `backend/test/deals-feeds.e2e-spec.ts` (append; needs DB)

**Interfaces:**
- Consumes: `OnlineFeedQuery`, `encodeOnlineCursor`/`decodeOnlineCursor`, `mapPrismaDeal`, `redemptionBrand` (Task 4).
- Produces: `FeedsService.student(q: OnlineFeedQuery): Promise<DealPage>`; `GET /v1/feeds/student`.

- [ ] **Step 1: Add `redemption_brand` to the blended SQL select**

In `feeds.service.ts` `queryBlended`, in the `candidates` SELECT column list, add `d.redemption_brand,` next to `d.destination_url,`. (Required so `mapNearbyRow` — now reading `row.redemption_brand` — gets a value rather than `undefined` on nearby rows.)

- [ ] **Step 2: Add the `student()` service method**

In `feeds.service.ts`, add (mirrors `online()` but curated + studentOnly):

```typescript
  /**
   * Student Perks feed: curated, published, unexpired, student-only ONLINE
   * programs, newest first, cursor-paginated. Curated (not authoritative) — these
   * carry trustLevel 'curated' and never a Verified badge. No location required.
   */
  async student(q: OnlineFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const cursor = q.cursor ? decodeOnlineCursor(q.cursor) : null;
    const cursorFilter: Prisma.DealWhereInput = cursor
      ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
      : {};
    const rows = await this.prisma.deal.findMany({
      where: {
        status: 'published',
        sourceTrust: 'editorial',
        moderationStatus: 'approved',
        isOnline: true,
        isStudentOnly: true,
        expiresAt: { gt: new Date() },
        ...cursorFilter,
      },
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeOnlineCursor(last.createdAt, last.id) : null;
    return { items: page.map((d) => mapPrismaDeal(d, null)), nextCursor };
  }
```

- [ ] **Step 3: Extend the nearby backfill to include curated student-online deals**

In `feeds.service.ts` `nearby()`, inside the existing `if (!cursor && page.length < limit) { ... }` block, after building `onlineItems`, also query curated student-online deals to fill any remaining slots and append them:

```typescript
      const remaining = limit - page.length - onlineItems.length;
      const studentItems =
        remaining > 0
          ? (
              await this.prisma.deal.findMany({
                where: {
                  status: 'published', sourceTrust: 'editorial', moderationStatus: 'approved',
                  isOnline: true, isStudentOnly: true, expiresAt: { gt: new Date() },
                },
                include: { category: true },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: remaining,
              })
            ).map((d) => mapPrismaDeal(d, null))
          : [];
      const items = [...page.map(mapNearbyRow), ...onlineItems, ...studentItems];
      const tiersIncluded = [...new Set(items.map((d) => d.trustLevel))];
      return { items, nextCursor, coverage, blend: { radiusMilesUsed: radiusUsed, tiersIncluded } };
```

Replace the existing `const items = [...page.map(mapNearbyRow), ...onlineItems];` and its `return` inside that block with the above.

- [ ] **Step 4: Add the controller route**

In `feeds.controller.ts`, add (mirrors `online`):

```typescript
  @Public()
  @Get('student')
  @ApiOperation({ summary: 'Curated national student programs, newest first (cursor paginated)' })
  student(@Query() query: OnlineFeedQuery) {
    return this.feeds.student(query);
  }
```

- [ ] **Step 5: Write the e2e test (needs DB up)**

In `backend/test/deals-feeds.e2e-spec.ts`, follow the file's existing seeding helpers to insert one curated student deal (`sourceTrust:'editorial'`, `moderationStatus:'approved'`, `status:'published'`, `isOnline:true`, `isStudentOnly:true`, `redemptionBrand:'Apple Store'`) and one authoritative online deal, then assert:

```typescript
it('GET /v1/feeds/student returns only curated student-online deals with redemptionBrand', async () => {
  const res = await request(app.getHttpServer()).get('/v1/feeds/student').expect(200);
  const items = res.body.items;
  expect(items.length).toBeGreaterThanOrEqual(1);
  for (const it of items) {
    expect(it.isOnline).toBe(true);
    expect(it.isStudentOnly).toBe(true);
    expect(it.trustLevel).toBe('curated');
    expect(it.verified).toBe(false);
  }
  expect(items.some((i: any) => i.redemptionBrand === 'Apple Store')).toBe(true);
});

it('GET /v1/feeds/online still excludes curated student deals (authoritative only)', async () => {
  const res = await request(app.getHttpServer()).get('/v1/feeds/online').expect(200);
  expect(res.body.items.every((i: any) => i.trustLevel !== 'curated')).toBe(true);
});
```

> NOTE: Read the top of `deals-feeds.e2e-spec.ts` for the exact app-bootstrap + seeding/cleanup helpers (`request`, `app`, deal-insert helper) and reuse them verbatim rather than inventing new setup.

- [ ] **Step 6: Run unit build + e2e (DB up)**

```bash
cd backend && pnpm exec tsc --noEmit
# Ensure Postgres is up (colima start; docker compose up -d) then:
pnpm test:e2e -- deals-feeds
```
Expected: type-clean; the two new e2e assertions pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/feeds/feeds.service.ts backend/src/feeds/feeds.controller.ts backend/test/deals-feeds.e2e-spec.ts
git commit -m "feat(backend): /v1/feeds/student + curated student-online nearby backfill"
```

---

### Task 6: Curated link-liveness verification (flag, never archive)

**Files:**
- Modify: `backend/src/ingestion/verification.service.ts`
- Test: `backend/src/ingestion/verification.service.spec.ts` (append or create)

**Interfaces:**
- Consumes: `ProviderRegistry`, `PrismaService`.
- Produces: `VerificationService.checkCuratedLinks(now?, fetchImpl?): Promise<{ checked: number; flagged: number }>` — HEAD/GET each active `student-programs` deal's `destinationUrl`; healthy → clears `verificationFailureReason` + refreshes `lastVerificationAttemptAt`; failing → sets `verificationFailureReason`, leaves `status='published'` (never archived) and `verificationStatus` unchanged (stays `pending`, never `verified`).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/ingestion/verification.service.spec.ts (append; create with imports if absent)
describe('checkCuratedLinks', () => {
  it('flags a dead link without archiving and never marks verified', async () => {
    // Arrange: a fake prisma with one published student deal; capture update calls.
    const deal = { id: 'd1', destinationUrl: 'https://dead.example', status: 'published' };
    const updates: any[] = [];
    const prisma: any = {
      deal: {
        findMany: async () => [deal],
        update: async (args: any) => { updates.push(args); return {}; },
      },
    };
    const registry: any = { get: () => ({ trust: 'editorial', name: 'student-programs' }) };
    const svc = new VerificationService(prisma, registry, { index: async () => {} } as any);
    const failing = async () => ({ ok: false, status: 500 }) as any; // fake fetch
    const res = await svc.checkCuratedLinks(new Date(), failing);
    expect(res.flagged).toBe(1);
    const data = updates[0].data;
    expect(data.verificationFailureReason).toBeTruthy();
    expect(data.status).toBeUndefined();          // not archived
    expect(data.verificationStatus).toBeUndefined(); // never promoted to verified
  });

  it('clears the failure reason for a healthy link', async () => {
    const deal = { id: 'd2', destinationUrl: 'https://ok.example', status: 'published' };
    const updates: any[] = [];
    const prisma: any = {
      deal: { findMany: async () => [deal], update: async (a: any) => { updates.push(a); return {}; } },
    };
    const registry: any = { get: () => ({ trust: 'editorial', name: 'student-programs' }) };
    const svc = new VerificationService(prisma, registry, { index: async () => {} } as any);
    const healthy = async () => ({ ok: true, status: 200 }) as any;
    const res = await svc.checkCuratedLinks(new Date(), healthy);
    expect(res.flagged).toBe(0);
    expect(updates[0].data.verificationFailureReason).toBeNull();
  });
});
```

> NOTE: Match `VerificationService`'s real constructor (read its `constructor(...)`: `prisma`, `registry`, `search`). The `search` arg here is a minimal stub.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && pnpm jest verification.service
```
Expected: FAIL — `checkCuratedLinks` is not a function.

- [ ] **Step 3: Implement `checkCuratedLinks`**

In `verification.service.ts`, add a method (uses injectable `fetch` for testability; default to global `fetch`):

```typescript
  /**
   * Link-liveness pass for curated student programs. A HEAD (then GET) on each
   * active program's destinationUrl. Healthy (2xx/3xx) clears any prior failure
   * note. Failure flags `verificationFailureReason` for manual review but NEVER
   * archives the deal or promotes it to verified — these are stable, hand-vetted
   * programs and transient link issues must not yank real inventory.
   */
  async checkCuratedLinks(
    now = new Date(),
    doFetch: (url: string, init?: any) => Promise<{ ok: boolean; status: number }> =
      (url, init) => fetch(url, init) as unknown as Promise<{ ok: boolean; status: number }>,
  ): Promise<{ checked: number; flagged: number }> {
    const deals = await this.prisma.deal.findMany({
      where: { status: 'published', source: 'student-programs', destinationUrl: { not: null } },
      select: { id: true, destinationUrl: true },
    });
    let flagged = 0;
    for (const d of deals) {
      const url = d.destinationUrl as string;
      let healthy = false;
      try {
        let r = await doFetch(url, { method: 'HEAD', redirect: 'follow' });
        if (!r.ok) r = await doFetch(url, { method: 'GET', redirect: 'follow' });
        healthy = r.ok;
      } catch {
        healthy = false;
      }
      if (healthy) {
        await this.prisma.deal.update({
          where: { id: d.id },
          data: { lastVerificationAttemptAt: now, verificationFailureReason: null },
        });
      } else {
        flagged++;
        this.logger.warn(`Curated link unhealthy (flagged for review): ${url}`);
        await this.prisma.deal.update({
          where: { id: d.id },
          data: { lastVerificationAttemptAt: now, verificationFailureReason: `link unreachable: ${url}` },
        });
      }
    }
    return { checked: deals.length, flagged };
  }
```

- [ ] **Step 4: Run the test + build**

```bash
cd backend && pnpm jest verification.service && pnpm exec tsc --noEmit
```
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ingestion/verification.service.ts backend/src/ingestion/verification.service.spec.ts
git commit -m "feat(backend): curated link-liveness check (flag, never archive)"
```

---

### Task 7: Full verification

- [ ] **Step 1: Unit suite (no DB)**

```bash
cd backend && pnpm jest
```
Expected: all unit specs pass, including the new provider/registry/mapper/verification specs.

- [ ] **Step 2: Type + lint**

```bash
cd backend && pnpm exec tsc --noEmit && pnpm lint
```
Expected: clean.

- [ ] **Step 3: e2e (DB up)**

```bash
cd backend && pnpm test:e2e -- deals-feeds
```
Expected: the `/v1/feeds/student` and `/v1/feeds/online` exclusion assertions pass.

- [ ] **Step 4: Manual smoke (optional, DB + server up)**

```bash
curl -s "http://localhost:3000/v1/feeds/student?limit=5" | head
```
Expected: curated student programs with `"trustLevel":"curated"`, `"verified":false`, and `redemptionBrand` set for Apple/Samsung/Microsoft.

---

## Self-Review

**Spec coverage:**
- StudentProgramsProvider, editorial trust, production-visible → Tasks 2 + 3.
- redemptionBrand field end-to-end → Tasks 1 + 4 (+ SQL select in 5.1).
- `GET /v1/feeds/student` + nearby backfill → Task 5.
- Link verification (flag, never archive) → Task 6.
- v1 catalog (13 programs, brands on Apple/Samsung/Microsoft) → Task 2.
- Curated-never-verified, online feed unchanged → Tasks 4 (mapper test) + 5 (e2e).
- Real-data-only / null prices / https URLs → Task 2 test assertions.

**Placeholder scan:** No TBD/TODO. `NOTE` blocks point at real constructor signatures / seeding helpers to match (registry/verification constructors, e2e seeding) — behavior and signatures are fully specified; the note exists because those exact arg lists live in files the implementer must read, not because the logic is unspecified.

**Type consistency:** `redemptionBrand: string | null` (DTO + NormalizedDeal + internal mapper) and DB `redemption_brand` / `NearbyRow.redemption_brand` are consistent. `FeedsService.student(q: OnlineFeedQuery): Promise<DealPage>` matches `online()`'s shape and the controller call. `checkCuratedLinks` signature matches its test. Provider `name='student-programs'` matches the registry assertion and the verification `source` filter.

**Known DB dependency:** Tasks 1.2 (migration), 5.5–5.6, 6 (no), and 7.3 require the dev Postgres (colima + docker compose). Unit specs (Tasks 2, 3, 4, 6) run without a DB via `pnpm jest`.
