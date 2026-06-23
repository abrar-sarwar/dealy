# Cross-Campus Trending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light up the TrendingCampusDeals slot — derive `isTrending` server-side from a deterministic high-value/urgency rule, serve trending deals to every campus via a location-independent feed, and surface them in a dedicated iOS "Trending" section.

**Architecture:** A pure `deriveTrending` in the backend mapper sets `DealDto.isTrending`; `FeedsService.trending` serves the trending-rule deals with no geo filter; iOS adds a `.trending` feed fetch, `AppState.trendingDeals`, and a Trending section mirroring Student Perks.

**Tech Stack:** Backend NestJS/TS + Jest (run from `backend/`, `pnpm`). iOS Swift/SwiftUI + XCTest + XcodeGen. Backend e2e needs the colima/Postgres stack (already up on :5434).

## Global Constraints

- Trending rule (verbatim): `authoritative && verified && (savingsPercentage >= 50 || endsWithin 48h)`.
- Derived at map/query time — NO DB column, NO migration, NO job.
- REAL DATA ONLY; cross-campus deals shown with honest distance, never "near you".
- Backend `isTrending` emitted on every feed (true property of the deal).
- iOS `Deal.isTrending`/`DealDTO.isTrending?`/`InventoryClassifier.trending` already exist — do not re-add.
- Popularity weighting out of scope (leave `RecommendationsService.trending` in place, unused by the route).
- TDD, frequent commits. `xcodegen generate` after new iOS files.

---

### Task 1: Backend `deriveTrending` + `DealDto.isTrending`

**Files:**
- Modify: `backend/src/deals/deal.dto.ts` (add `isTrending`)
- Modify: `backend/src/deals/deal.mapper.ts` (add `deriveTrending`, emit in `toDealDto`)
- Test: `backend/src/deals/deal.mapper.spec.ts` (append)

**Interfaces:**
- Produces: `export function deriveTrending(input): boolean`; `DealDto.isTrending: boolean`.

- [ ] **Step 1: Write the failing tests**

```typescript
// Append to backend/src/deals/deal.mapper.spec.ts
import { deriveTrending } from './deal.mapper';

describe('deriveTrending', () => {
  const soon = new Date(Date.now() + 12 * 3600 * 1000);
  const later = new Date(Date.now() + 30 * 24 * 3600 * 1000);

  it('high-discount verified authoritative deal trends', () => {
    expect(deriveTrending({ sourceTrust: 'authoritative', verificationStatus: 'verified',
      savingsPercentage: 55, expiresAt: later })).toBe(true);
  });
  it('urgent verified authoritative deal trends even at low discount', () => {
    expect(deriveTrending({ sourceTrust: 'authoritative', verificationStatus: 'verified',
      savingsPercentage: 10, expiresAt: soon })).toBe(true);
  });
  it('unexceptional verified deal does not trend', () => {
    expect(deriveTrending({ sourceTrust: 'authoritative', verificationStatus: 'verified',
      savingsPercentage: 10, expiresAt: later })).toBe(false);
  });
  it('editorial/unverified never trends regardless of savings', () => {
    expect(deriveTrending({ sourceTrust: 'editorial', verificationStatus: 'pending',
      savingsPercentage: 80, expiresAt: soon })).toBe(false);
    expect(deriveTrending({ sourceTrust: 'authoritative', verificationStatus: 'pending',
      savingsPercentage: 80, expiresAt: soon })).toBe(false);
  });
});

describe('mapPrismaDeal isTrending', () => {
  function highValueVerified(over: Partial<any> = {}) {
    return {
      id: 'd', title: 't', merchant: 'm', category: { slug: 'entertainment' },
      shortDescription: '', detailedDescription: '', terms: '',
      currentPriceMinor: 2000n, originalPriceMinor: 5000n, currency: 'USD', // 60% off
      dealScore: 50, isOnline: false, isStudentOnly: false,
      couponCode: null, destinationUrl: null, redemptionBrand: null,
      latitude: 34.0, longitude: -84.5, locationTags: ['Kennesaw'], visualSeed: 0,
      verificationStatus: 'verified', lastVerifiedAt: new Date(), createdAt: new Date(),
      startAt: null, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      sourceTrust: 'authoritative', moderationStatus: 'approved', status: 'published',
      confidenceScore: null, ...over,
    };
  }
  it('emits isTrending true for a high-value verified deal', () => {
    expect(mapPrismaDeal(highValueVerified() as any, null).isTrending).toBe(true);
  });
  it('emits isTrending false for a low-value verified deal', () => {
    const lowValue = highValueVerified({ currentPriceMinor: 4500n, originalPriceMinor: 5000n }); // 10% off
    expect(mapPrismaDeal(lowValue as any, null).isTrending).toBe(false);
  });
});
```

> NOTE: `mapPrismaDeal` is already imported at the top of this spec file (it has existing tests). Only add the `deriveTrending` import.

- [ ] **Step 2: Run to verify fail**

```bash
cd backend && pnpm jest deal.mapper
```
Expected: FAIL — `deriveTrending` not exported; `isTrending` missing on DTO.

- [ ] **Step 3: Add `isTrending` to `DealDto`**

In `backend/src/deals/deal.dto.ts`, after `isStudentOnly: boolean;`:

```typescript
  /** Derived: an exceptional (high-value or urgent) verified deal, featured
   * across all campuses. Computed at map time; never stored. */
  isTrending: boolean;
```

- [ ] **Step 4: Implement `deriveTrending` + emit it**

In `backend/src/deals/deal.mapper.ts`, add near the top (after imports):

```typescript
/** Hours within which an offer counts as "ending soon" for trending. */
const TRENDING_URGENCY_HOURS = 48;
/** Min percent off for a non-urgent deal to trend. */
const TRENDING_MIN_PERCENT = 50;

/**
 * A deal trends (is featured cross-campus) when it is authoritative + verified
 * AND exceptional: a strong discount OR ending soon. Pure + deterministic.
 */
export function deriveTrending(input: {
  sourceTrust: string;
  verificationStatus: string;
  savingsPercentage: number;
  expiresAt: Date;
  now?: Date;
}): boolean {
  if (input.sourceTrust !== 'authoritative' || input.verificationStatus !== 'verified') return false;
  const now = input.now ?? new Date();
  const msToExpiry = input.expiresAt.getTime() - now.getTime();
  const endingSoon = msToExpiry > 0 && msToExpiry <= TRENDING_URGENCY_HOURS * 3600 * 1000;
  return input.savingsPercentage >= TRENDING_MIN_PERCENT || endingSoon;
}
```

In `toDealDto`, after `confidenceScore: n.confidenceScore,` add:

```typescript
    isTrending: deriveTrending({
      sourceTrust: n.sourceTrust,
      verificationStatus: n.verificationStatus,
      savingsPercentage,
      expiresAt: n.expiresAt,
    }),
```

(`savingsPercentage` is already computed above in `toDealDto`.)

- [ ] **Step 5: Run to verify pass**

```bash
cd backend && pnpm jest deal.mapper && pnpm exec tsc --noEmit
```
Expected: PASS, type-clean. (Other `DealDto` builders — e.g. `search.mapper.ts` — now need `isTrending`; the tsc step will flag them. Add `isTrending: false` to `searchDocToDealDto` with a comment "search results don't compute trending yet," matching how `redemptionBrand` was handled.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/deals/deal.dto.ts backend/src/deals/deal.mapper.ts backend/src/deals/deal.mapper.spec.ts backend/src/search/search.mapper.ts
git commit -m "feat(backend): derive isTrending (high-value/urgent verified) on DealDto"
```

---

### Task 2: `GET /v1/feeds/trending` — location-independent

**Files:**
- Modify: `backend/src/feeds/feeds.service.ts` (add `trending`)
- Modify: `backend/src/feeds/feeds.controller.ts` (repoint route)
- Test: `backend/test/deals-feeds.e2e-spec.ts` (append; DB up)

**Interfaces:**
- Consumes: `OnlineFeedQuery`, `mapPrismaDeal`, `deriveTrending` (Task 1).
- Produces: `FeedsService.trending(q: OnlineFeedQuery): Promise<DealPage>`.

- [ ] **Step 1: Add the service method**

In `feeds.service.ts` (after `student(...)`), querying verified inventory with NO geo filter and keeping only trending-rule deals:

```typescript
  /**
   * Cross-campus trending: exceptional (high-value or ending-soon) authoritative
   * + verified deals, featured to every campus regardless of location. Strongest
   * savings first. No geo filter by design — discovery, not proximity.
   */
  async trending(q: OnlineFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const rows = await this.prisma.deal.findMany({
      where: {
        status: 'published',
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        expiresAt: { gt: new Date() },
      },
      include: { category: true },
      orderBy: [{ dealScore: 'desc' }, { id: 'asc' }],
    });
    const items = rows
      .map((d) => mapPrismaDeal(d, null))
      .filter((d) => d.isTrending)
      .sort((a, b) => b.savingsPercentage - a.savingsPercentage || b.dealScore - a.dealScore)
      .slice(0, limit);
    return { items, nextCursor: null };
  }
```

> NOTE: Trending is a curated, small set — a single non-paginated page (limit 20) is fine; `nextCursor` is always null. Keep it simple.

- [ ] **Step 2: Repoint the controller route**

In `feeds.controller.ts`, change the `trending` handler to call `FeedsService`:

```typescript
  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Cross-campus trending deals (high-value/urgent, location-independent)' })
  trending(@Query() query: OnlineFeedQuery) {
    return this.feeds.trending(query);
  }
```

Remove the now-unused `RecommendationsService`/`FeedPageQuery` import ONLY if nothing else in the controller uses them (the `recommended` route still does — so keep the imports; just change the `trending` body and its decorator).

- [ ] **Step 3: Write the e2e test (DB up)**

In `backend/test/deals-feeds.e2e-spec.ts`, seed (via the existing helpers/`makeDeal`) one far high-value verified deal (e.g. 60% off, `latitude/longitude` far from GSU) and one verified-but-low-value deal, then:

```typescript
it('GET /v1/feeds/trending returns high-value verified deals regardless of location', async () => {
  // Seed a far, 60%-off verified deal and a near 10%-off verified deal.
  const trendingId = await makeDeal({
    currentPriceMinor: 2000n, originalPriceMinor: 5000n,
    latitude: 34.0, longitude: -84.58, locationTags: ['Kennesaw'],
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  const dullId = await makeDeal({
    currentPriceMinor: 4500n, originalPriceMinor: 5000n,
    latitude: 33.7531, longitude: -84.3857,
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  const res = await app.inject({ method: 'GET', url: '/v1/feeds/trending?limit=50' });
  expect(res.statusCode).toBe(200);
  const ids = (res.json().items as Array<{ id: string; isTrending: boolean }>);
  expect(ids.some((d) => d.id === trendingId)).toBe(true);   // far high-value featured
  expect(ids.every((d) => d.isTrending)).toBe(true);
  expect(ids.some((d) => d.id === dullId)).toBe(false);       // low-value excluded
});
```

> NOTE: Read the existing `makeDeal` helper in this file (around the "Verified-inventory gating" section) — it defaults `sourceTrust:'authoritative'`, `verificationStatus:'verified'`, `status:'published'`, `source:'e2e-feeds'`. Pass only the overrides shown; match its real param names.

- [ ] **Step 4: Run (DB up)**

```bash
cd backend && pnpm exec tsc --noEmit && pnpm test:e2e -- deals-feeds
```
Expected: type-clean; the new trending assertion passes (pre-existing coverage-gating failures, if still present, are unrelated — see prior session notes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/feeds/feeds.service.ts backend/src/feeds/feeds.controller.ts backend/test/deals-feeds.e2e-spec.ts
git commit -m "feat(backend): location-independent /v1/feeds/trending (cross-campus)"
```

---

### Task 3: iOS `.trending` feed fetch

**Files:**
- Modify: `Dealy/Services/DealServicing.swift`, `Dealy/Services/API/RemoteDealService.swift`, `Dealy/Services/MockDealService.swift`, `Dealy/Data/MockDeals.swift`
- Test: `DealyTests/RemoteDealServiceTests.swift` (append)

**Interfaces:**
- Produces: `DealFeedRequest.trending`; `RemoteDealService` GETs `/v1/feeds/trending`.

- [ ] **Step 1: Failing test**

```swift
// Append to DealyTests/RemoteDealServiceTests.swift
func testTrendingRoutesToTrendingFeed() async throws {
    StubURLProtocol.reset()
    StubURLProtocol.responder = { path in
        XCTAssertEqual(path, "/v1/feeds/trending")
        return Self.page(ids: ["t1", "t2"], online: false)
    }
    let service = RemoteDealService(client: Self.stubbedClient())
    let page = try await service.fetchDeals(for: .trending)
    XCTAssertEqual(page.items.map(\.id), ["t1", "t2"])
}
```

- [ ] **Step 2: Run to verify fail**

`xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/RemoteDealServiceTests`
Expected: FAIL — no `.trending` case.

- [ ] **Step 3: Add the case + routing**

In `DealServicing.swift`:
```swift
    /// Cross-campus high-value/urgent deals, featured regardless of location.
    case trending
```
In `RemoteDealService.fetchDeals` switch:
```swift
            case .trending:
                let page = try await client.get(
                    "/v1/feeds/trending",
                    query: [URLQueryItem(name: "limit", value: "50")],
                    as: DealPageDTO.self
                )
                return DealPage(items: page.items.map { $0.toDeal() }, nextCursor: page.nextCursor)
```
In `MockDealService.fetchDeals`, before the discovery mapping (next to the `.student` early return):
```swift
        if case .trending = request {
            let trending = all.filter { $0.savingsPercentage >= 50 }
                .map { d -> Deal in var x = d; x.isTrending = true; x.verified = true; return x }
            return DealPage(items: trending, nextCursor: nil)
        }
```
Add `case .trending: preference = .default.switching(to: .anywhere) // handled by early return` to the inner `switch request` (exhaustiveness). Also update the `key(for:)` switch in `AppStateTests.swift` ControllableDealService: `case .trending: return "trending"`.

> NOTE: If `MockDeals.dataset` has no deal with `savingsPercentage >= 50`, add one high-value entry to `MockDeals` (or reuse the seed factory) so the mock trending set is non-empty for previews/tests.

- [ ] **Step 4: Run to verify pass**

`xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/RemoteDealServiceTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Services Dealy/Data/MockDeals.swift DealyTests/RemoteDealServiceTests.swift DealyTests/AppStateTests.swift Dealy.xcodeproj
git commit -m "feat(ios): .trending feed request routed to /v1/feeds/trending"
```

---

### Task 4: `AppState.trendingDeals` + `loadTrendingDeals()`

**Files:**
- Modify: `Dealy/ViewModels/AppState.swift`
- Test: `DealyTests/AppStateTests.swift` (append)

**Interfaces:**
- Produces: `AppState.trendingDeals: [Deal]`, `AppState.loadTrendingDeals() async`.

- [ ] **Step 1: Failing test**

```swift
// Append inside AppStateTests
func testLoadTrendingDealsPopulatesAndResolves() async {
    let app = makeApp()
    await app.loadTrendingDeals()
    XCTAssertFalse(app.trendingDeals.isEmpty)
    XCTAssertTrue(app.trendingDeals.allSatisfy { $0.isTrending })
    XCTAssertNotNil(app.deal(id: app.trendingDeals[0].id))
}
```

- [ ] **Step 2: Run to verify fail**

`xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/AppStateTests`
Expected: FAIL — no `trendingDeals`.

- [ ] **Step 3: Implement (mirror `studentDeals`)**

Add stored property near `studentDeals`:
```swift
    /// Cross-campus trending deals, featured regardless of location.
    private(set) var trendingDeals: [Deal] = []
```
Add loader near `loadStudentDeals`:
```swift
    @MainActor
    func loadTrendingDeals() async {
        do {
            let page = try await dealService.fetchDeals(for: .trending)
            trendingDeals = page.items
            for deal in page.items { dealsByID[deal.id] = deal }
        } catch {
            trendingDeals = []
        }
    }
```

- [ ] **Step 4: Run to verify pass** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/ViewModels/AppState.swift DealyTests/AppStateTests.swift
git commit -m "feat(ios): AppState.trendingDeals + loadTrendingDeals()"
```

---

### Task 5: Trending section + See-all list (Explore)

**Files:**
- Create: `Dealy/Views/Trending/TrendingSection.swift`, `Dealy/Views/Trending/TrendingListView.swift`
- Modify: `Dealy/Views/Explore/ExploreView.swift`

**Interfaces:**
- Consumes: `app.trendingDeals`, `app.loadTrendingDeals()`, `DealRowCard`, `EmptyStateView`.

- [ ] **Step 1: Create `TrendingListView`** (mirror `StudentPerksListView`)

```swift
// Dealy/Views/Trending/TrendingListView.swift
import SwiftUI

/// Full list of cross-campus trending deals. Distance shown honestly by DealRowCard.
struct TrendingListView: View {
    @Environment(AppState.self) private var app
    @State private var selected: Deal?

    var body: some View {
        ScrollView {
            if app.trendingDeals.isEmpty {
                EmptyStateView(symbol: "flame",
                               title: "Nothing trending yet",
                               message: "Exceptional campus deals will show up here as they appear.")
                    .padding(.top, Spacing.xl)
            } else {
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(app.trendingDeals) { deal in
                        DealRowCard(deal: deal) { app.recordOpened(deal.id); selected = deal }
                    }
                }
                .padding(Spacing.lg)
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Trending")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selected) { DealDetailView(deal: $0) }
    }
}
```

- [ ] **Step 2: Create `TrendingSection`** (mirror `StudentPerksSection`, flame icon)

```swift
// Dealy/Views/Trending/TrendingSection.swift
import SwiftUI

/// Explore section featuring cross-campus trending deals. Renders nothing when empty.
struct TrendingSection: View {
    let deals: [Deal]
    let onSelect: (Deal) -> Void

    var body: some View {
        if !deals.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                header
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(deals.prefix(4)) { deal in
                        DealRowCard(deal: deal) { onSelect(deal) }
                    }
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    private var header: some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: "flame.fill").font(.subheadline.weight(.bold)).foregroundStyle(Theme.primary)
            Text("Trending").font(.title3.weight(.bold)).foregroundStyle(Theme.primaryText)
            Spacer()
            NavigationLink { TrendingListView() } label: {
                Text("See all").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.primary)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}
```

- [ ] **Step 3: Wire into `ExploreView`**

In `curatedSections`, add `TrendingSection` above `StudentPerksSection`:
```swift
            TrendingSection(deals: app.trendingDeals) { deal in
                app.recordOpened(deal.id); selectedDeal = deal
            }
```
Add a load task next to the student one:
```swift
            .task { await app.loadTrendingDeals() }
```

- [ ] **Step 4: Build**

`xcodegen generate && xcodebuild build -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Views/Trending Dealy/Views/Explore/ExploreView.swift Dealy.xcodeproj
git commit -m "feat(ios): cross-campus Trending section + See-all list in Explore"
```

---

### Task 6: Full verification

- [ ] **Backend:** `cd backend && pnpm jest && pnpm exec tsc --noEmit` → all green.
- [ ] **iOS:** `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` → TEST SUCCEEDED.
- [ ] **(Optional) Screenshot:** temp-default the tab to Explore, launch, confirm a "Trending" section renders above "Student Perks"; revert.

---

## Self-Review

**Spec coverage:** rule-based `deriveTrending` (Task 1); `DealDto.isTrending` emitted everywhere (Task 1); location-independent `/v1/feeds/trending` (Task 2); iOS `.trending` fetch (Task 3); `AppState.trendingDeals` (Task 4); dedicated Trending section + See-all (Task 5); honest distance via existing `DealRowCard`; popularity explicitly out of scope; no schema change. Tests at each layer.

**Placeholder scan:** No TBD/TODO. `NOTE`s point at the real `makeDeal` helper, the `search.mapper.ts` `isTrending: false` shim (mirrors the redemptionBrand precedent), and the exhaustiveness updates the compiler forces. All behavior specified.

**Type consistency:** `deriveTrending(input)` signature matches its tests and the `toDealDto` call; `DealDto.isTrending: boolean`; `DealFeedRequest.trending`; `AppState.trendingDeals`/`loadTrendingDeals()` mirror the student equivalents; `FeedsService.trending(q: OnlineFeedQuery): Promise<DealPage>` matches `student()`/`online()`. iOS `Deal.isTrending` already exists (set in MockDealService trending path).

**Exhaustiveness reminder:** adding `DealFeedRequest.trending` forces updates to every `switch` over it — `RemoteDealService`, `MockDealService` (×2: early return + inner preference switch), and `AppStateTests` `ControllableDealService.key(for:)`. Task 3 covers all four.
