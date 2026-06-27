# Dealy Discovery + iOS Surfacing Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or executing-plans. Steps use `- [ ]`.

**Goal:** Diversify discovery supply and make discovered deals surface correctly across Map, Local, Explore, and the swipe deck — with **honest geographic accuracy** (exact vs region-estimated, never faked) and **real images when available** with graceful fallback.

**Architecture:** NestJS+Prisma+PostGIS backend, SwiftUI iOS. Discovery: crawl_sources → Firecrawl → Gemini → deal_candidates → promotion → deals → `/v1/feeds/local` → iOS. Changes extend existing boundaries; no unrelated refactors.

## Global Constraints (verbatim, bind every task)
- Do NOT break existing cost controls (Firecrawl page caps, Gemini AI-cache, planCrawl gate, content-hash skip, quota stop).
- Gemini quota is limited — source QUALITY over count; tests verify ≤8 enabled in runbook examples.
- No bare-domain crawling — every enabled source must resolve to a non-bare URL via `resolveCrawlTargets`.
- Do NOT invent fake sources; use real, crawlable public URLs. Seed new sources `enabled: false` unless verified live+crawlable.
- **Do NOT fake coordinate precision.** If only the region is known, mark the deal `approximate` and render it as an approximate-area pin/label — never a precise storefront pin or a precise distance.
- TDD: failing test first for every behavior-bearing unit.
- Valid category slugs: `food, groceries, tech, studentSupplies, clothing, entertainment, beauty, automotive, home, books`. Valid CrawlKind: `restaurant, happy_hour, student_discount, grocery_circular, local_promo`. Allowed target paths (DISCOVERY_TARGET_PATHS): `/deals,/coupons,/promotions,/offers,/weekly-ad,/weeklyad,/weekly-specials,/specials,/student-discounts,/events,/restaurants` (extend if a new source needs `/happy-hour` etc).

## Design decision (locked): honest coordinates
Add `location_precision: 'exact' | 'approximate'` to `deal_candidates` and `deals` (default `approximate`).
- Runner best-effort geocodes the merchant/locationText (reuse existing `Geocoder`). On success → exact merchant coords, `precision='exact'`. On failure/no address → **region centroid (no scatter)**, `precision='approximate'`.
- **Delete `scatterCoord`** — it fakes precision.
- iOS: exact → solid pin + precise distance; approximate → faded "region" pin at centroid + "~ <region>" label, distance rendered as approximate ("~ Midtown area"), never "0.4 mi".

---

### Task 1 — Cleanup: remove stray `Dealy copy-Info.plist` safely

**Files:** `Dealy.xcodeproj/project.pbxproj`, `Dealy copy-Info.plist` (delete), `project.yml` (verify).

It is referenced by the **test target** `INFOPLIST_FILE` (pbxproj lines ~971, ~996) and two file refs (~218, ~559); `project.yml` test config uses `GENERATE_INFOPLIST_FILE: YES`. Re-running xcodegen would wipe the manual signing edits (team `FZ44V8RNMH`), so edit pbxproj directly.

- [ ] **Step 1:** In `project.pbxproj`, for both test-target build configs, replace `INFOPLIST_FILE = "Dealy copy-Info.plist";` with `GENERATE_INFOPLIST_FILE = YES;` (match project.yml). Remove the two file-reference lines (the `PBXFileReference` at ~218 and the group child at ~559).
- [ ] **Step 2:** `git rm "Dealy copy-Info.plist"`.
- [ ] **Step 3:** Build the test target to verify it still resolves an Info.plist:
  `xcodebuild -project Dealy.xcodeproj -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build-for-testing` → BUILD SUCCEEDED.
- [ ] **Step 4:** Commit: `chore(ios): remove stray Dealy copy-Info.plist; tests use generated Info.plist`.

---

### Task 2 — Tests: source balance + crawl-target safety (RED)

**Files:** `backend/src/discovery/curated-sources.spec.ts` (extend).

- [ ] **Step 1:** Add tests (will fail against current seed):
```ts
import { crawlSources } from '../../prisma/seed';
// counts by defaultCategorySlug
const dist = () => {
  const m = new Map<string, number>();
  for (const s of crawlSources) m.set(s.defaultCategorySlug, (m.get(s.defaultCategorySlug) ?? 0) + 1);
  return m;
};

describe('curated source balance', () => {
  it('covers a diverse category mix (not just food/grocery)', () => {
    const d = dist();
    for (const cat of ['food', 'entertainment', 'studentSupplies', 'beauty', 'groceries']) {
      expect((d.get(cat) ?? 0)).toBeGreaterThan(0);
    }
  });

  it('is not grocery-dominated (groceries < 30% of sources)', () => {
    const total = crawlSources.length;
    const grocery = dist().get('groceries') ?? 0;
    expect(grocery / total).toBeLessThan(0.3);
  });

  it('every source declares a valid category slug', () => {
    const ok = new Set(['food','groceries','tech','studentSupplies','clothing','entertainment','beauty','automotive','home','books']);
    for (const s of crawlSources) expect(ok.has(s.defaultCategorySlug)).toBe(true);
  });

  it('homepage-style sources (no targeted seeded path) declare dealUrl or targetPaths', () => {
    const allowed = ['/deals','/coupons','/promotions','/offers','/weekly-ad','/weeklyad','/weekly-specials','/specials','/student-discounts','/events','/restaurants','/happy-hour'];
    for (const s of crawlSources) {
      const path = new URL(s.url).pathname;
      const targeted = allowed.some((p) => path.includes(p));
      if (!targeted) expect(Boolean(s.dealUrl) || (s.targetPaths?.length ?? 0) > 0).toBe(true);
    }
  });
});
```
- [ ] **Step 2:** Run `pnpm jest src/discovery/curated-sources.spec.ts` → the balance + grocery tests FAIL (RED). Commit with the seed in Task 3.

---

### Task 3 — Backend: balanced source seed expansion (GREEN)

**Files:** `backend/prisma/seed.ts` (extend `crawlSources`), `docs` summary (in Task 8).

Add **real, public, crawlable** sources across categories, all `enabled: false`, each resolving to a targeted path. Suggested additions (verify live before enabling; targetPaths must be in the allowed list — add `/happy-hour` to `DISCOVERY_TARGET_PATHS` default if used):
- **Restaurants/Food (food):** a happy-hour/specials page with `/happy-hour` or `/specials` (e.g. a known Atlanta restaurant group specials page); a food-hall events page (`/events`).
- **Entertainment (entertainment):** an Atlanta events/deals page with `/events` or `/deals` (e.g. a venue/museum student-night page), keep Discover Atlanta + BeltLine.
- **Student (studentSupplies / student_discount):** campus bookstore coupon/`/student-discounts` page; keep Student Beans/UNiDAYS.
- **Retail/Supplies (tech / clothing / studentSupplies):** a store coupons/`/deals` page (real retailer coupons page).
- **Beauty/Fitness/Services (beauty):** a salon/gym/service-promo `/specials` or `/offers` page.
- **Grocery (groceries):** keep existing but ensure < 30% of total after additions.

Each new entry: `{ url, sourceType, kind, merchantHint, defaultCategorySlug, zoneSlug, dealUrl: <verified deals page or null>, targetPaths: [...] , crawlIntervalHours }`. If a candidate URL is known to 403/require login/heavy-JS, DO NOT add it (or add disabled with a `// NOTE: unverified` comment and exclude from "enabled" examples).

- [ ] **Step 1:** Extend `crawlSources` so the Task 2 tests pass (diverse categories, grocery < 30%). If adding `/happy-hour`, also extend `DISCOVERY_TARGET_PATHS` default in `env.schema.ts` + its spec assertion.
- [ ] **Step 2:** `pnpm jest src/discovery/curated-sources.spec.ts` → all green (incl. the existing non-bare-target + zone tests).
- [ ] **Step 3:** `pnpm prisma generate` (no schema change) + `pnpm tsc --noEmit` clean.
- [ ] **Step 4:** Commit: `feat(discovery): balanced curated source seed (entertainment/beauty/student/retail), grocery <30%`.

---

### Task 4 — Backend+iOS: honest coordinates (exact vs approximate)

**Files:** `backend/prisma/schema.prisma` (+migration), `discovery-runner.service.ts` (geocode + remove scatter), `candidate-promotion.service.ts`, `deal.dto.ts`/`deal.mapper.ts`, `feeds.service.ts` (select precision), `discovery.module.ts` (wire Geocoder), specs; iOS `DealDTO.swift`, `Deal.swift`, `DealGeo.swift`, `DealsMapView.swift`, card/format, `DealyTests`.

- [ ] **Step 1 (schema):** Add to `DealCandidate` and `Deal`: `locationPrecision String @default("approximate") @map("location_precision")`. Additive migration (`ALTER TABLE ... ADD COLUMN "location_precision" TEXT NOT NULL DEFAULT 'approximate';` for both). `pnpm prisma generate`.
- [ ] **Step 2 (runner, RED test first):** Replace `scatterCoord` usage. New behavior, with a test in `discovery-runner.service.spec.ts`:
  - Inject a `Geocoder` (reuse `GEOCODER` from crawler) into the runner. Per deal: if `dl.location` present, `geocoder.geocode(merchant + ' ' + location)`; on result → `latitude/longitude = result`, `locationPrecision='exact'`. Else → `latitude/longitude = inventory centroid`, `locationPrecision='approximate'`. **Delete `scatterCoord`.**
  - Test: with a fake geocoder returning a coord → candidate stored with those coords + `locationPrecision:'exact'`; with geocoder returning null → centroid coords + `locationPrecision:'approximate'` (and NOT scattered — equals the centroid exactly).
- [ ] **Step 3 (promotion):** copy `locationPrecision` candidate→deal; `isOnline = latitude == null` unchanged. Update spec to assert precision flows through.
- [ ] **Step 4 (DTO/feed):** add `locationPrecision` to `DealDto` + `mapNearbyRow`; `feeds.service.ts` local()/nearby() SQL `SELECT d.location_precision`. Spec: `/v1/feeds/local` returns precision; distance equals true `ST_Distance` from query point (e2e in `discovery-promotion.e2e-spec.ts` — assert a deal at known coords returns expected distance ±0.1mi).
- [ ] **Step 5 (iOS):** add `locationPrecision: String?` to `DealDTO` + `Deal` (default "approximate"); `Deal.isApproximateLocation` computed. `DealGeo.coordinate`: for any deal WITH backend lat/lng use them verbatim (no re-scatter); keep the visualSeed synth only as a last resort when lat/lng are nil. `DealsMapView`: approximate deals → faded/hollow pin style + the "Approximate area" treatment; the existing "Approximate locations · N" note stays. Card/`Format`: when `isApproximateLocation`, render `"~ \(region)"`/`"~ nearby"` instead of `"0.4 mi"`.
- [ ] **Step 6 (iOS tests, DealyTests):** DTO mapping preserves latitude/longitude/distanceMiles/locationPrecision; `DealGeo.coordinate` returns the deal's exact lat/lng when present (no scatter); an approximate deal formats distance as approximate, an exact deal as "X mi".
- [ ] **Step 7:** Backend lint/tsc/tests green; iOS builds + DealyTests pass. Commit: `feat(discovery): honest exact-vs-approximate coordinates (geocode w/ region fallback, no scatter)`.

---

### Task 5 — Local discovered deals appear in the swipe/card deck

**Files:** iOS `HomeFeedViewModel.swift`, `AppState.swift` (ensure localDeals loaded for Home), `HomeView.swift` (.task), `DealyTests`; backend already covered by `discovery-promotion.e2e-spec.ts`.

- [ ] **Step 1 (RED test):** In `DealyTests`, a test that `HomeFeedViewModel.rebuild` with `allDeals=[nearbyA]` and `localDeals=[localB, nearbyA-dup]` produces a deck containing `localB`, includes `nearbyA` once (deduped by id), and preserves each deal's `verified` flag.
- [ ] **Step 2 (impl):** `rebuild(using:)` composes from `app.allDeals + app.localDeals`, dedupe by `id` (prefer the verified/authoritative copy on conflict), then the existing filter/rank pipeline. Ensure `HomeView` `.task { await app.loadLocalDeals() }` so the deck has them. Keep verified vs curated badges (no label change).
- [ ] **Step 3:** DealyTests pass; verify in Simulator the Home deck shows a curated local deal with its curated (non-Verified) styling. Commit: `feat(ios): blend curated local deals into the Home swipe deck (dedupe by id, trust labels preserved)`.

---

### Task 6 — Real deal images: capture + carry through API

**Files:** `firecrawl.types.ts`/`firecrawl.client.ts` (request OG image metadata), `discovery-runner.service.ts` (capture+validate imageUrl), schema (+migration: `image_url` on candidate+deal), `candidate-promotion.service.ts`, `deal.dto.ts`/`deal.mapper.ts`, specs; iOS `DealDTO.swift`/`Deal.swift`.

- [ ] **Step 1:** Firecrawl scrape already returns `metadata`. Read `doc.metadata?.ogImage` (or `og:image`). Add a pure helper `validImageUrl(u): string | null` — must be `https://`, not obviously a 1x1/tracking/icon (reject if path matches `/(pixel|tracking|spacer|1x1|\.svg$)/i` or is a known logo sprite); return null otherwise. Unit-test it (RED first).
- [ ] **Step 2 (schema):** add `imageUrl String? @map("image_url")` to `DealCandidate` + `Deal`; additive migration. `pnpm prisma generate`.
- [ ] **Step 3 (runner):** store `imageUrl: validImageUrl(doc.metadata?.ogImage)` on the candidate. (No extra Gemini call — image comes from scrape metadata.)
- [ ] **Step 4 (promotion+DTO):** copy candidate.imageUrl → deal.imageUrl; add `imageUrl: string | null` to `DealDto` + mapper; `feeds.service.ts` SELECT `d.image_url`. Specs: image persists candidate→deal; `/v1/feeds/local` DTO includes imageUrl.
- [ ] **Step 5 (iOS DTO):** add `imageUrl: String?` to `DealDTO` + `Deal`. DealyTest: DTO mapping preserves imageUrl (and nil when absent).
- [ ] **Step 6:** backend lint/tsc/tests green; iOS builds + tests pass. Commit: `feat(discovery): capture OG image from scrape metadata; carry imageUrl through promotion + API`.

---

### Task 7 — iOS: render remote images with fallback

**Files:** new `Dealy/Components/DealImage.swift`, used by `DealDetailView.swift`, `DealRowCard.swift`, `SwipeCardView.swift`, `DealTile.swift`, Map preview; `DealyTests`.

- [ ] **Step 1:** `DealImage` view: takes `deal` + sizing; if `deal.imageURL` is a valid URL, `AsyncImage` with phases (empty→progress, success→image, failure→`CategoryArtwork(...)`); else `CategoryArtwork(...)`. Uses the framework's URL cache; never blocks. Identical fallback look to today.
- [ ] **Step 2:** Replace the 4–5 `CategoryArtwork(...)` call sites with `DealImage(deal:...)` (keeping sizes/cornerRadius). 
- [ ] **Step 3 (test):** DealyTest asserting `DealImage`'s url-selection logic — given a deal with a valid https imageURL it chooses remote; given nil/invalid it chooses the CategoryArtwork fallback (extract the choice into a testable pure function `DealImage.resolvedSource(deal) -> .remote(URL) | .fallback`).
- [ ] **Step 4:** Build + DealyTests pass; verify in Simulator a deal with an image shows it and one without falls back. Commit: `feat(ios): render real deal images with CategoryArtwork fallback`.

---

### Task 8 — Operator docs / discovery runbook

**Files:** `backend/docs/discovery-sources.md`.

- [ ] **Step 1:** Write the runbook: (a) enabling a small set (≤8) of verified sources (SQL/`crawlSource.updateMany enabled:true` example, scoped to a zone); (b) `pnpm discovery:run atlanta`; (c) inspecting crawl_runs / deal_candidates / promoted deals / `GET /v1/feeds/local` (the exact queries used in this session); (d) quota guidance — ≤8 high-quality sources, targeted deal pages only, avoid menu/homepage, use `gemini-3.1-flash-lite`; (e) the source list added with enabled/disabled status + why.
- [ ] **Step 2:** Commit: `docs(discovery): source enablement + discovery runbook`.

---

## Verification
- Backend: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm jest` (discovery/feeds/gemini suites + the e2e), and the new coordinate/feed/image specs.
- iOS: build clean; DealyTests for DTO mapping (coords+precision+image), deck inclusion+dedupe, map-uses-deal-coords, image fallback.
- Simulator manual: Map pins match deal coords (exact solid, approximate faded "~ region"); local deals appear as swipe cards; real images where present + fallback works; grocery no longer dominates with balanced sources enabled.

## Deliverables
Updated `seed.ts`; backend tests (balance, coordinate flow, promotion, feed visibility, images); iOS tests (DTO, deck, map accuracy, image fallback); SwiftUI remote-image rendering; `discovery-sources.md`; summary of sources added + enabled/disabled + why.
