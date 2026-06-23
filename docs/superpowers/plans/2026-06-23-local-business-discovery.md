# Local-Business 15mi Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface real curated local deals within 15 miles in a dedicated "Local Deals" section, sourced by the existing crawler over the real Atlanta seed URLs (enabled + auto-published), via a new ungated `/v1/feeds/local` endpoint.

**Architecture:** Backend adds `FeedsService.local` (PostGIS `ST_DWithin` over editorial+approved+published physical deals, NOT coverage-gated) on `GET /v1/feeds/local`. iOS adds a `.local` feed request, `AppState.localDeals`, and a Local Deals section. The crawler/extraction code is reused as-is — enabled + configured, not modified.

**Tech Stack:** Backend NestJS/TS + Prisma/PostGIS + Jest (run from `backend/`). iOS Swift/SwiftUI + XCTest + XcodeGen. DB on :5434 (up).

## Global Constraints

- Local deals are `editorial`/`curated` trust — `trustLevel: 'curated'`, never Verified, never counted toward coverage.
- `/v1/feeds/local` is NOT coverage-gated (curated discovery surface); the verified `/feeds/nearby` deck stays density-gated and verified-only (do not touch it).
- Physical only (`geog NOT NULL`); online deals never appear in local.
- Default radius 15mi.
- REAL DATA ONLY — crawler over real seeds; no fabricated deals. Report actual yield.
- TDD, frequent commits. `xcodegen generate` after new iOS files.
- Adding `DealFeedRequest.local` forces updates to every switch over it: `RemoteDealService`, `MockDealService` (early-return + inner preference switch), `AppStateTests` `key(for:)`.

---

### Task 1: Backend `GET /v1/feeds/local`

**Files:**
- Modify: `backend/src/feeds/feeds.service.ts` (add `local`)
- Modify: `backend/src/feeds/feeds.controller.ts` (route)
- Test: `backend/test/deals-feeds.e2e-spec.ts` (append; DB up)

**Interfaces:**
- Consumes: `NearbyFeedQuery` (has lat/lng/radiusMiles/limit/category), `mapNearbyRow`, `FEED_TIER_CASE_SQL`, `Prisma`.
- Produces: `FeedsService.local(q: NearbyFeedQuery): Promise<DealPage>`; `GET /v1/feeds/local`.

- [ ] **Step 1: Add the service method**

In `feeds.service.ts` (after `trending(...)`), a curated 15mi PostGIS query mirroring `queryBlended`'s column list but editorial-filtered and distance-ordered:

```typescript
  /**
   * Local Deals: curated (editorial), approved, published, PHYSICAL deals within
   * the radius (default 15mi), nearest first. NOT coverage-gated — this is the
   * curated discovery surface (the verified deck is /feeds/nearby). Online and
   * authoritative-only deals never appear here.
   */
  async local(q: NearbyFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const radiusMeters = (q.radiusMiles ?? 15) * METERS_PER_MILE;
    const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`;
    const categoryFilter = q.category
      ? Prisma.sql`AND d.category_id = (SELECT id FROM categories WHERE slug = ${q.category})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
      SELECT d.id, d.title, d.merchant, cat.slug AS category_slug,
             d.short_description, d.detailed_description, d.terms,
             d.current_price_minor, d.original_price_minor, d.currency,
             d.deal_score, d.is_online, d.is_student_only, d.coupon_code, d.destination_url,
             d.redemption_brand,
             d.latitude, d.longitude, d.location_tags, d.visual_seed,
             d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
             d.status, d.confidence_score, d.created_at, d.start_at, d.expires_at,
             ST_Distance(d.geog, ${center}) AS distance_meters,
             (${Prisma.raw(FEED_TIER_CASE_SQL)})::int AS tier_rank,
             CASE (${Prisma.raw(FEED_TIER_CASE_SQL)})::int
               WHEN 0 THEN 'verified' WHEN 1 THEN 'curated'
               WHEN 2 THEN 'online' ELSE 'community' END AS feed_tier,
             ST_Distance(d.geog, ${center})::double precision AS sort_key
      FROM deals d
      JOIN categories cat ON cat.id = d.category_id
      WHERE d.status = 'published'::deal_status
        AND d.source_trust = 'editorial'::source_trust
        AND d.moderation_status = 'approved'::moderation_status
        AND d.is_online = false
        AND d.geog IS NOT NULL
        AND d.expires_at > now()
        AND ST_DWithin(d.geog, ${center}, ${radiusMeters})
        ${categoryFilter}
      ORDER BY distance_meters ASC, id ASC
      LIMIT ${limit}
    `);
    return { items: rows.map(mapNearbyRow), nextCursor: null };
  }
```

- [ ] **Step 2: Add the controller route**

In `feeds.controller.ts` (after `student`):

```typescript
  @Public()
  @Get('local')
  @ApiOperation({ summary: 'Curated local deals within radius (default 15mi), nearest first' })
  local(@Query() query: NearbyFeedQuery) {
    return this.feeds.local(query);
  }
```

`NearbyFeedQuery` is already imported in the controller.

- [ ] **Step 3: e2e test (DB up)**

In `backend/test/deals-feeds.e2e-spec.ts`, append (reusing `makeDeal`, which defaults authoritative/verified — override `sourceTrust`/`moderationStatus` for curated):

```typescript
it('GET /v1/feeds/local returns curated physical deals within radius, nearest first', async () => {
  const near = await makeDeal({
    title: 'Curated Taco Near', sourceTrust: 'editorial', moderationStatus: 'approved',
    verificationStatus: 'pending', latitude: GSU.lat + 0.01, longitude: GSU.lng, // ~0.7mi
  });
  const far = await makeDeal({
    title: 'Curated Taco Far', sourceTrust: 'editorial', moderationStatus: 'approved',
    verificationStatus: 'pending', latitude: GSU.lat + 0.5, longitude: GSU.lng, // ~34mi
  });
  const authoritative = await makeDeal({
    title: 'Authoritative Event', latitude: GSU.lat + 0.01, longitude: GSU.lng, // verified, not curated
  });
  const res = await app.inject({
    method: 'GET', url: `/v1/feeds/local?lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15&limit=50`,
  });
  expect(res.statusCode).toBe(200);
  const items = res.json().items as Array<{ id: string; trustLevel: string; isOnline: boolean }>;
  expect(items.some((d) => d.id === near)).toBe(true);
  expect(items.some((d) => d.id === far)).toBe(false);          // beyond 15mi
  expect(items.some((d) => d.id === authoritative)).toBe(false); // curated-only surface
  expect(items.every((d) => d.trustLevel === 'curated')).toBe(true);
  expect(items.every((d) => d.isOnline === false)).toBe(true);
});
```

> NOTE: `GSU` and `makeDeal` already exist in this file. Clean up via the existing `afterAll` (`source: 'e2e-feeds'`); `makeDeal` defaults `source:'e2e-feeds'`.

- [ ] **Step 4: Verify**

```bash
cd backend && pnpm exec tsc --noEmit && pnpm test:e2e -- deals-feeds
```
Expected: type-clean; the new local test passes (the 4 fixed coverage tests + others stay green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/feeds/feeds.service.ts backend/src/feeds/feeds.controller.ts backend/test/deals-feeds.e2e-spec.ts
git commit -m "feat(backend): GET /v1/feeds/local — curated 15mi local deals (ungated)"
```

---

### Task 2: iOS `.local` feed request

**Files:**
- Modify: `Dealy/Services/DealServicing.swift`, `Dealy/Services/API/RemoteDealService.swift`, `Dealy/Services/MockDealService.swift`, `Dealy/Data/MockDeals.swift`
- Test: `DealyTests/RemoteDealServiceTests.swift` (append)

**Interfaces:**
- Produces: `DealFeedRequest.local(center: DiscoveryCenter, radiusMiles: Int)`; `RemoteDealService` GETs `/v1/feeds/local?lat&lng&radiusMiles`.

- [ ] **Step 1: Failing test**

```swift
// Append to DealyTests/RemoteDealServiceTests.swift
func testLocalRoutesToLocalFeedWithCoords() async throws {
    StubURLProtocol.reset()
    StubURLProtocol.responder = { path in
        XCTAssertEqual(path, "/v1/feeds/local")
        return Self.page(ids: ["l1", "l2"], online: false)
    }
    let service = RemoteDealService(client: Self.stubbedClient())
    let center = DiscoveryCenter(latitude: 33.7531, longitude: -84.3857,
                                 displayName: "Current location", source: .device)
    let page = try await service.fetchDeals(for: .local(center: center, radiusMiles: 15))
    XCTAssertEqual(page.items.map(\.id), ["l1", "l2"])
}
```

> NOTE: `StubURLProtocol` records only the path (not query); asserting the path is consistent with the existing nearby/online tests.

- [ ] **Step 2: Run to verify fail**

`xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/RemoteDealServiceTests`
Expected: FAIL — no `.local` case.

- [ ] **Step 3: Add case + routing**

`DealServicing.swift`:
```swift
    /// Curated local deals (restaurants, student discounts, …) within a radius
    /// of a coordinate. Curated trust; its own discovery surface.
    case local(center: DiscoveryCenter, radiusMiles: Int)
```
`RemoteDealService.fetchDeals` switch:
```swift
            case let .local(center, radiusMiles):
                let page = try await client.get(
                    "/v1/feeds/local",
                    query: [
                        URLQueryItem(name: "lat", value: String(center.latitude)),
                        URLQueryItem(name: "lng", value: String(center.longitude)),
                        URLQueryItem(name: "radiusMiles", value: String(radiusMiles)),
                        URLQueryItem(name: "limit", value: "50"),
                    ],
                    as: DealPageDTO.self
                )
                return DealPage(items: page.items.map { $0.toDeal() }, nextCursor: page.nextCursor)
```
`MockDealService.fetchDeals`, next to `.student`/`.trending` early returns:
```swift
        if case .local = request {
            // Physical, curated-style mock local deals (offline double).
            let local = all.filter { !$0.isOnline }
            return DealPage(items: Array(local.prefix(8)), nextCursor: nil)
        }
```
and the inner preference switch:
```swift
        case .local: preference = .default.switching(to: .anywhere) // handled by early return above
```
and `AppStateTests` `ControllableDealService.key(for:)`:
```swift
        case .local: return "local"
```

> NOTE: `.local` has associated values; in the inner `switch request` use `case .local:` (ignoring payload). Mock returns physical deals; no new MockDeals entry needed (the dataset has many physical deals).

- [ ] **Step 4: Run to verify pass** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Services Dealy/Data/MockDeals.swift DealyTests/RemoteDealServiceTests.swift DealyTests/AppStateTests.swift Dealy.xcodeproj
git commit -m "feat(ios): .local(center,radius) feed request routed to /v1/feeds/local"
```

---

### Task 3: `AppState.localDeals` + `loadLocalDeals()`

**Files:**
- Modify: `Dealy/ViewModels/AppState.swift`
- Test: `DealyTests/AppStateTests.swift` (append)

**Interfaces:**
- Produces: `AppState.localDeals: [Deal]`, `AppState.loadLocalDeals() async`.

- [ ] **Step 1: Failing test**

```swift
// Append inside AppStateTests
func testLoadLocalDealsPopulatesAndResolves() async {
    let app = makeApp()
    await app.loadLocalDeals()
    XCTAssertFalse(app.localDeals.isEmpty)
    XCTAssertTrue(app.localDeals.allSatisfy { !$0.isOnline })
    XCTAssertNotNil(app.deal(id: app.localDeals[0].id))
}
```

- [ ] **Step 2: Run to verify fail** — Expected: no `localDeals`.

- [ ] **Step 3: Implement (mirror studentDeals/trendingDeals)**

Property near `trendingDeals`:
```swift
    /// Curated local deals within ~15mi of the active center.
    private(set) var localDeals: [Deal] = []
```
Loader near `loadTrendingDeals`:
```swift
    /// Load curated local deals within 15mi of the active discovery center.
    /// Independent of the deck; failures leave it empty and never block.
    @MainActor
    func loadLocalDeals(radiusMiles: Int = 15) async {
        do {
            let page = try await dealService.fetchDeals(
                for: .local(center: persisted.discovery.center, radiusMiles: radiusMiles))
            localDeals = page.items
            for deal in page.items { dealsByID[deal.id] = deal }
        } catch {
            localDeals = []
        }
    }
```

- [ ] **Step 4: Run to verify pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/ViewModels/AppState.swift DealyTests/AppStateTests.swift
git commit -m "feat(ios): AppState.localDeals + loadLocalDeals()"
```

---

### Task 4: Local Deals section + See-all list (Explore)

**Files:**
- Create: `Dealy/Views/Local/LocalDealsSection.swift`, `Dealy/Views/Local/LocalDealsListView.swift`
- Modify: `Dealy/Views/Explore/ExploreView.swift`

- [ ] **Step 1: `LocalDealsListView`** (mirror TrendingListView, fork.knife icon, "Local Deals" title, empty message "No local deals nearby yet — we’re curating them.")

- [ ] **Step 2: `LocalDealsSection`** (mirror TrendingSection: header `Image("fork.knife")` + "Local Deals" + "See all" → `LocalDealsListView`; `deals.prefix(4)` `DealRowCard`s; renders nothing when empty).

> NOTE: Copy the exact structure of `Dealy/Views/Trending/TrendingSection.swift` / `TrendingListView.swift` (already in the repo), swapping the symbol (`fork.knife`), title ("Local Deals"), the `app.localDeals` source, and the empty-state copy. Same `DealRowCard`/`SectionHeader`/`EmptyStateView`/`NavigationLink` usage.

- [ ] **Step 3: Wire into `ExploreView`**

In `curatedSections`, add below `StudentPerksSection`:
```swift
            LocalDealsSection(deals: app.localDeals) { deal in
                app.recordOpened(deal.id); selectedDeal = deal
            }
```
Add a load task:
```swift
            .task { await app.loadLocalDeals() }
```

- [ ] **Step 4: Build**

`xcodegen generate && xcodebuild build -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Views/Local Dealy/Views/Explore/ExploreView.swift Dealy.xcodeproj
git commit -m "feat(ios): Local Deals section + See-all list in Explore"
```

---

### Task 5: Full verification

- [ ] **Backend:** `cd backend && pnpm jest && pnpm exec tsc --noEmit && pnpm test:e2e -- deals-feeds` → green.
- [ ] **iOS:** `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` → TEST SUCCEEDED.

---

### Task 6: Make it real — enable + run the crawler (operational)

- [ ] **Step 1: Enable the real Atlanta seed sources** (leave the `example.test` fixture disabled):

```bash
docker exec dealy_postgres psql -U dealy -d dealy -c \
  "UPDATE crawl_sources SET enabled = true WHERE url NOT LIKE '%example.test%';"
```

- [ ] **Step 2: Run the crawler with auto-publish** (LLM extraction uses `ANTHROPIC_API_KEY` if set; structured extraction works without):

```bash
cd backend && CRAWLER_AUTOPUBLISH_THRESHOLD=70 \
  CRAWLER_AUTOPUBLISH_KINDS=restaurant,happy_hour,student_discount,grocery_circular,local_promo \
  pnpm crawl all
```

- [ ] **Step 3: Report the ACTUAL yield (honest):**

```bash
docker exec dealy_postgres psql -U dealy -d dealy -tAc \
  "select source_trust, moderation_status, count(*) from deals where source='crawler' group by 1,2;"
curl -s "http://localhost:3000/v1/feeds/local?lat=33.7531&lng=-84.3857&radiusMiles=15&limit=20" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);print('local items:',len(d['items']));[print(' -',i['title'],'|',i['merchant'],'|',i['category']) for i in d['items'][:10]]"
```

Report exactly how many real deals were extracted/published and from which sources. If yield is low, say so and name the sources that produced — no padding.

- [ ] **Step 4: Screenshot** the Local Deals section on the sim (relaunch with `SIMCTL_CHILD_DEALY_API_ENV=local`) showing the real crawled deals.

---

## Self-Review

**Spec coverage:** ungated curated `/v1/feeds/local` 15mi (Task 1); iOS `.local` fetch (Task 2); `AppState.localDeals` (Task 3); Local Deals section + See-all (Task 4); enable+run crawler + honest yield report (Task 6). Curated-only, physical-only, distance-ordered, not coverage-gated — all asserted (Task 1 e2e). Verified deck untouched.

**Placeholder scan:** No TBD/TODO. `NOTE`s point at the existing Trending section/list files to copy and the existing `makeDeal`/`GSU` helpers. The local SQL mirrors the verified `queryBlended` column list exactly so `mapNearbyRow` consumes it unchanged.

**Type consistency:** `FeedsService.local(q: NearbyFeedQuery): Promise<DealPage>` matches the controller call; `NearbyRow` columns match `mapNearbyRow`. iOS `DealFeedRequest.local(center:radiusMiles:)` used identically in RemoteDealService, the test, and `loadLocalDeals`; exhaustiveness updates enumerated for all four switches.

**Exhaustiveness:** `.local` added to `RemoteDealService`, `MockDealService` (early-return + inner switch), `AppStateTests.key(for:)` — Task 2 Step 3 covers all.
