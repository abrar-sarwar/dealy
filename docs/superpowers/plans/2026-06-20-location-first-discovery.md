# Location-First Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dealy resolve the user's current or selected location, load nearby deals within a 1–100 mile radius, support an online-only Anywhere mode, and keep Home and Search on one shared discovery preference.

**Architecture:** `AppState` remains the composition root and owns one persisted `DiscoveryPreference`. Small protocol-backed services isolate Core Location and Apple geocoding from SwiftUI. `DealServicing` becomes discovery-aware, while the NestJS API exposes separate nearby and online feeds; stale client requests are rejected before they can replace the current deck.

**Tech Stack:** Swift 5, SwiftUI, Observation, Core Location, MapKit geocoding, XCTest, NestJS 11, Fastify, TypeScript, Prisma, PostgreSQL/PostGIS, Jest.

## Global Constraints

- iOS deployment target remains 17.0.
- Request only `When In Use` location authorization; never request background location.
- Persist one active discovery center, not location history.
- Default radius is 10 miles; valid nearby range is 1–100 miles.
- `Anywhere` returns online deals only and does not use a large fake radius.
- Search/Explore owns location and radius controls; Home remains a swipe-focused deck.
- Search changes apply atomically and refresh Home immediately.
- Saved deals and swipe history survive location migration and later location changes.
- The LLM, full Dealy+ map, marketplace submissions, and seller reputation are outside this implementation.
- Preserve unrelated existing work in `backend/src/providers`, `backend/docs`, and backend configuration files.

---

## File Structure

### New iOS files

- `Dealy/Models/DiscoveryPreference.swift` — persisted discovery mode, center, source, validation, and legacy-campus conversion.
- `Dealy/Services/LocationProviding.swift` — authorization and one-shot coordinate interfaces plus `CoreLocationProvider`.
- `Dealy/Services/PlaceResolving.swift` — city/ZIP candidate interface plus Apple geocoder implementation.
- `Dealy/Views/Location/LocationSearchResultsView.swift` — focused candidate picker for ambiguous manual searches.
- `DealyTests/DiscoveryPreferenceTests.swift` — model validation and persistence migration.
- `DealyTests/LocationProviderTests.swift` — provider state/error mapping using deterministic delegates.
- `DealyTests/PlaceResolverTests.swift` — manual location success, empty result, and ambiguity.
- `DealyTests/RemoteDealServiceTests.swift` — nearby/online request routing.

### Modified iOS files

- `Dealy/Services/PreferencesStore.swift` — version-tolerant persisted discovery state.
- `Dealy/ViewModels/AppState.swift` — dependency injection, atomic discovery updates, reload generation protection.
- `Dealy/Services/DealServicing.swift` — discovery-aware page request.
- `Dealy/Services/API/APIConfig.swift` — remove hard-coded metro query in favor of feed request types.
- `Dealy/Services/API/RemoteDealService.swift` — route Nearby and Anywhere requests.
- `Dealy/Services/MockDealService.swift` — mirror production eligibility behavior.
- `Dealy/Services/DealFilter.swift` — filter mock/local data by discovery mode.
- `Dealy/Components/RadiusControl.swift` — 1–100 mile range.
- `Dealy/Views/Onboarding/OnboardingFlow.swift` — discovery draft instead of campus-only state.
- `Dealy/Views/Onboarding/OnboardingLocationView.swift` — current-location permission and city/ZIP fallback.
- `Dealy/Views/Onboarding/OnboardingConfirmView.swift` — display discovery center and radius/mode.
- `Dealy/Views/Location/LocationSelectorView.swift` — Search-owned draft editor for current/manual location and Anywhere.
- `Dealy/Views/Explore/ExploreView.swift` — location entry, shared feed, and Dealy+ map preview gate.
- `Dealy/Views/Home/HomeView.swift` — observe discovery changes and offer widen/Anywhere empty actions.
- `Dealy/ViewModels/HomeFeedViewModel.swift` — consume already eligible global inventory.
- `Dealy/Views/Profile/ProfileSheets.swift` — update any campus-only location summary/call site.
- `Dealy/Resources/Info.plist` — location permission purpose string.
- Existing iOS tests — update campus-only assertions to discovery assertions.

### Modified backend files

- `backend/src/deals/deal.dto.ts` — validate nearby radius through 100 and define the online pagination query.
- `backend/src/feeds/feeds.service.ts` — add online-only cursor feed.
- `backend/src/feeds/feeds.controller.ts` — expose `GET /v1/feeds/online`.
- `backend/test/deals-feeds.e2e-spec.ts` — boundary and online-only coverage.
- `backend/docs/openapi.json` — regenerate after API contract changes.

---

### Task 1: Introduce the Discovery Domain and Persistence Migration

**Files:**
- Create: `Dealy/Models/DiscoveryPreference.swift`
- Create: `DealyTests/DiscoveryPreferenceTests.swift`
- Modify: `Dealy/Services/PreferencesStore.swift`
- Modify: `DealyTests/PersistenceTests.swift`
- Modify: `DealyTests/AppStateTests.swift`

**Interfaces:**
- Produces: `DiscoveryMode`, `DiscoverySource`, `DiscoveryCenter`, and `DiscoveryPreference`.
- Produces: `PersistedState.discovery: DiscoveryPreference`.
- Preserves: decoding previously stored state containing only `campusID` and `radius`.

- [ ] **Step 1: Write failing model and migration tests**

Add tests with exact expected behavior:

```swift
func testNearbyPreferenceClampsRadiusToSupportedRange() {
    let center = DiscoveryCenter(
        latitude: 33.7531,
        longitude: -84.3857,
        displayName: "Atlanta, GA",
        source: .manual
    )
    XCTAssertEqual(DiscoveryPreference.nearby(center: center, radiusMiles: 0).radiusMiles, 1)
    XCTAssertEqual(DiscoveryPreference.nearby(center: center, radiusMiles: 101).radiusMiles, 100)
}

func testAnywherePreservesLastNearbyCenter() {
    let nearby = DiscoveryPreference.nearby(center: .legacyCampus(.georgiaTech), radiusMiles: 10)
    let anywhere = nearby.switching(to: .anywhere)
    XCTAssertEqual(anywhere.mode, .anywhere)
    XCTAssertEqual(anywhere.center, nearby.center)
    XCTAssertEqual(anywhere.radiusMiles, 10)
}

func testLegacyPersistedStateDecodesIntoDiscoveryPreference() throws {
    let json = """
    {
      "hasCompletedOnboarding": true,
      "campusID": "uga",
      "radius": 9,
      "interests": [],
      "savedDealIDs": [],
      "watchedDealIDs": [],
      "swipeHistory": [],
      "savingsEvents": [],
      "notificationsEnabled": false
    }
    """.data(using: .utf8)!

    let decoded = try JSONDecoder().decode(PersistedState.self, from: json)
    XCTAssertEqual(decoded.discovery.center.displayName, Campus.uga.name)
    XCTAssertEqual(decoded.discovery.radiusMiles, 9)
    XCTAssertEqual(decoded.discovery.center.source, .legacyCampus)
}
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
xcodegen generate
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData \
  -only-testing:DealyTests/DiscoveryPreferenceTests \
  -only-testing:DealyTests/PersistenceTests test
```

Expected: compilation fails because `DiscoveryPreference` and `PersistedState.discovery` do not exist.

- [ ] **Step 3: Implement the discovery value types**

Create:

```swift
import Foundation

enum DiscoveryMode: String, Codable, CaseIterable {
    case nearby
    case anywhere
}

enum DiscoverySource: String, Codable {
    case device
    case manual
    case legacyCampus
}

struct DiscoveryCenter: Codable, Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    let displayName: String
    let source: DiscoverySource

    static func legacyCampus(_ campus: Campus) -> Self {
        Self(
            latitude: campus.latitude,
            longitude: campus.longitude,
            displayName: campus.name,
            source: .legacyCampus
        )
    }
}

struct DiscoveryPreference: Codable, Equatable, Sendable {
    static let minRadius = 1
    static let maxRadius = 100
    static let defaultRadius = 10

    var mode: DiscoveryMode
    var center: DiscoveryCenter
    var radiusMiles: Int
    var updatedAt: Date

    static func nearby(
        center: DiscoveryCenter,
        radiusMiles: Int = defaultRadius,
        updatedAt: Date = Date()
    ) -> Self {
        Self(
            mode: .nearby,
            center: center,
            radiusMiles: min(max(radiusMiles, minRadius), maxRadius),
            updatedAt: updatedAt
        )
    }

    static let `default` = nearby(
        center: .legacyCampus(.atlanta),
        radiusMiles: defaultRadius,
        updatedAt: .distantPast
    )

    func switching(to mode: DiscoveryMode, updatedAt: Date = Date()) -> Self {
        var copy = self
        copy.mode = mode
        copy.updatedAt = updatedAt
        return copy
    }
}
```

Implement a custom `PersistedState.init(from:)` that:

1. decodes `discovery` when present;
2. otherwise decodes legacy `campusID` and `radius`;
3. converts them with `DiscoveryCenter.legacyCampus`;
4. defaults invalid/missing legacy values to Atlanta and 10 miles;
5. preserves all saves, watches, swipes, savings, interests, and notification fields.

Keep legacy `campusID`/`radius` as decode-only coding keys, not live duplicated state.

- [ ] **Step 4: Run focused tests and verify pass**

Run the command from Step 2.

Expected: `DiscoveryPreferenceTests` and `PersistenceTests` pass.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Models/DiscoveryPreference.swift \
  Dealy/Services/PreferencesStore.swift \
  DealyTests/DiscoveryPreferenceTests.swift \
  DealyTests/PersistenceTests.swift \
  DealyTests/AppStateTests.swift
git commit -m "feat: add persisted discovery preference"
```

---

### Task 2: Add Core Location and Manual Place Resolution Services

**Files:**
- Create: `Dealy/Services/LocationProviding.swift`
- Create: `Dealy/Services/PlaceResolving.swift`
- Create: `DealyTests/LocationProviderTests.swift`
- Create: `DealyTests/PlaceResolverTests.swift`
- Modify: `Dealy/Services/Placeholders.swift`
- Modify: `Dealy/Resources/Info.plist`

**Interfaces:**
- Produces: `LocationAuthorization`, `LocationProviderError`, and `LocationProviding`.
- Produces: `CoreLocationProvider`.
- Produces: `PlaceCandidate`, `PlaceResolverError`, and `PlaceResolving`.
- Produces: `ApplePlaceResolver`.

- [ ] **Step 1: Write failing service contract tests**

Add deterministic mock-based tests:

```swift
func testMockLocationProviderReturnsConfiguredCenter() async throws {
    let expected = DiscoveryCenter(
        latitude: 40.7128,
        longitude: -74.0060,
        displayName: "Current location",
        source: .device
    )
    let provider = MockLocationProvider(
        authorization: .authorizedWhenInUse,
        result: .success(expected)
    )
    XCTAssertEqual(try await provider.currentCenter(), expected)
}

func testDeniedLocationThrowsTypedError() async {
    let provider = MockLocationProvider(
        authorization: .denied,
        result: .failure(.denied)
    )
    do {
        _ = try await provider.currentCenter()
        XCTFail("Expected denied")
    } catch {
        XCTAssertEqual(error as? LocationProviderError, .denied)
    }
}

func testResolverReturnsMultipleCandidatesForAmbiguousQuery() async throws {
    let candidates = [
        PlaceCandidate(displayName: "Athens, GA", latitude: 33.9519, longitude: -83.3576),
        PlaceCandidate(displayName: "Athens, OH", latitude: 39.3292, longitude: -82.1013),
    ]
    let resolver = MockPlaceResolver(result: .success(candidates))
    XCTAssertEqual(try await resolver.resolve("Athens"), candidates)
}
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
xcodegen generate
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData \
  -only-testing:DealyTests/LocationProviderTests \
  -only-testing:DealyTests/PlaceResolverTests test
```

Expected: compilation fails because the service contracts do not exist.

- [ ] **Step 3: Implement protocol-backed services**

Define:

```swift
enum LocationAuthorization: Equatable {
    case notDetermined
    case denied
    case restricted
    case authorizedWhenInUse
}

enum LocationProviderError: Error, Equatable {
    case denied
    case restricted
    case unavailable
    case timeout
}

@MainActor
protocol LocationProviding: AnyObject {
    var authorization: LocationAuthorization { get }
    func requestWhenInUseAuthorization() async -> LocationAuthorization
    func currentCenter() async throws -> DiscoveryCenter
}

struct PlaceCandidate: Identifiable, Equatable, Sendable {
    var id: String { "\(latitude),\(longitude),\(displayName)" }
    let displayName: String
    let latitude: Double
    let longitude: Double

    var center: DiscoveryCenter {
        DiscoveryCenter(
            latitude: latitude,
            longitude: longitude,
            displayName: displayName,
            source: .manual
        )
    }
}

protocol PlaceResolving: Sendable {
    func resolve(_ query: String) async throws -> [PlaceCandidate]
}
```

Implement `CoreLocationProvider` as a `@MainActor` `CLLocationManagerDelegate`
bridge using checked continuations. It must:

- request only `requestWhenInUseAuthorization()`;
- call `requestLocation()` for a one-shot fix;
- reject locations older than 60 seconds or with negative horizontal accuracy;
- finish at most one continuation;
- time out after 12 seconds;
- map denied/restricted states to typed errors.

Implement `ApplePlaceResolver` with `CLGeocoder.geocodeAddressString`, mapping
placemarks with coordinates into de-duplicated `PlaceCandidate` values. Empty
trimmed input returns `[]`; geocoder failures throw `PlaceResolverError.unavailable`.

Move the mock implementations into these focused files and remove the old
placeholder `LocationProviding` declaration from `Placeholders.swift`.

- [ ] **Step 4: Add the permission usage string**

Add to `Dealy/Resources/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Dealy uses your location to find active deals near you.</string>
```

Do not add always/background location keys.

- [ ] **Step 5: Run tests and verify pass**

Run the command from Step 2.

Expected: both focused test suites pass.

- [ ] **Step 6: Commit**

```bash
git add Dealy/Services/LocationProviding.swift \
  Dealy/Services/PlaceResolving.swift \
  Dealy/Services/Placeholders.swift \
  Dealy/Resources/Info.plist \
  DealyTests/LocationProviderTests.swift \
  DealyTests/PlaceResolverTests.swift
git commit -m "feat: add device and manual location services"
```

---

### Task 3: Make AppState and Deal Services Discovery-Aware

**Files:**
- Modify: `Dealy/Services/DealServicing.swift`
- Modify: `Dealy/Services/API/APIConfig.swift`
- Modify: `Dealy/Services/API/RemoteDealService.swift`
- Modify: `Dealy/Services/MockDealService.swift`
- Modify: `Dealy/Services/DealFilter.swift`
- Modify: `Dealy/ViewModels/AppState.swift`
- Create: `DealyTests/RemoteDealServiceTests.swift`
- Modify: `DealyTests/AppStateTests.swift`
- Modify: `DealyTests/DealFilterTests.swift`

**Interfaces:**
- Consumes: `DiscoveryPreference`, `LocationProviding`, `PlaceResolving`.
- Produces: `DealFeedRequest`, `DealPage`, and `DealServicing.fetchDeals(for:)`.
- Produces: `AppState.applyDiscovery(_:)`, `refreshFromDeviceLocation()`, and `resolvePlaces(_:)`.

- [ ] **Step 1: Write failing request-routing and state tests**

Add:

```swift
func testApplyingDiscoveryReloadsUsingNewPreference() async {
    let service = RecordingDealService()
    let app = AppState(
        store: InMemoryPreferencesStore(),
        dealService: service,
        locationProvider: MockLocationProvider(),
        placeResolver: MockPlaceResolver()
    )
    let preference = DiscoveryPreference.nearby(
        center: DiscoveryCenter(
            latitude: 34.0522,
            longitude: -118.2437,
            displayName: "Los Angeles, CA",
            source: .manual
        ),
        radiusMiles: 25
    )

    await app.applyDiscovery(preference)

    XCTAssertEqual(app.discovery, preference)
    XCTAssertEqual(service.requests, [.nearby(preference)])
}

func testLateFeedResponseCannotReplaceNewerLocation() async {
    let service = ControllableDealService()
    let app = AppState(store: InMemoryPreferencesStore(), dealService: service)
    async let first: Void = app.applyDiscovery(.nearby(center: .legacyCampus(.atlanta), radiusMiles: 10))
    async let second: Void = app.applyDiscovery(.nearby(center: .legacyCampus(.uga), radiusMiles: 10))
    service.finishSecond(with: [Fixtures.athensDeal])
    service.finishFirst(with: [Fixtures.atlantaDeal])
    _ = await (first, second)
    XCTAssertEqual(app.allDeals.map(\.id), [Fixtures.athensDeal.id])
}

func testAnywhereMockFeedContainsOnlyOnlineDeals() async throws {
    let service = MockDealService(reference: reference, artificialDelay: .zero)
    let page = try await service.fetchDeals(for: .anywhere)
    XCTAssertTrue(page.items.allSatisfy(\.isOnline))
}
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
xcodegen generate
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData \
  -only-testing:DealyTests/AppStateTests \
  -only-testing:DealyTests/DealFilterTests \
  -only-testing:DealyTests/RemoteDealServiceTests test
```

Expected: compilation fails on the old parameterless service API.

- [ ] **Step 3: Define the feed contract**

Replace the service interface with:

```swift
enum DealFeedRequest: Equatable, Sendable {
    case nearby(DiscoveryPreference)
    case anywhere
}

struct DealPage: Equatable, Sendable {
    let items: [Deal]
    let nextCursor: String?
}

protocol DealServicing: AnyObject {
    func fetchDeals(for request: DealFeedRequest) async throws -> DealPage
}
```

`DiscoveryPreference.feedRequest` returns `.anywhere` when mode is Anywhere and
`.nearby(self)` otherwise.

- [ ] **Step 4: Implement remote and mock routing**

`RemoteDealService` must route:

```swift
switch request {
case .nearby(let preference):
    path = "/v1/feeds/nearby"
    query = [
        .init(name: "lat", value: String(preference.center.latitude)),
        .init(name: "lng", value: String(preference.center.longitude)),
        .init(name: "radiusMiles", value: String(preference.radiusMiles)),
        .init(name: "limit", value: "50"),
    ]
case .anywhere:
    path = "/v1/feeds/online"
    query = [.init(name: "limit", value: "50")]
}
```

Return `DealPage(items: dto.items.map(\.toDeal), nextCursor: dto.nextCursor)`.

`MockDealService` must:

- return active online-only deals for Anywhere;
- return active local deals within radius for Nearby;
- exclude online deals from Nearby so local mode is genuinely location-first;
- compute mock eligibility using `DiscoveryPreference`, not campus tags in views.

- [ ] **Step 5: Implement atomic AppState discovery changes**

Inject `LocationProviding` and `PlaceResolving` into `AppState`. Add:

```swift
var discovery: DiscoveryPreference { persisted.discovery }

@MainActor
func applyDiscovery(_ preference: DiscoveryPreference) async {
    persisted.discovery = preference
    persist()
    await loadDeals(for: preference.feedRequest)
}

@MainActor
func refreshFromDeviceLocation() async throws {
    let center = try await locationProvider.currentCenter()
    await applyDiscovery(.nearby(center: center, radiusMiles: discovery.radiusMiles))
}

func resolvePlaces(_ query: String) async throws -> [PlaceCandidate] {
    try await placeResolver.resolve(query)
}
```

Protect loading with a monotonically increasing generation:

```swift
private var loadGeneration = 0

@MainActor
func loadDeals(for request: DealFeedRequest? = nil) async {
    loadGeneration += 1
    let generation = loadGeneration
    let activeRequest = request ?? discovery.feedRequest
    loadState = .loading
    do {
        let page = try await dealService.fetchDeals(for: activeRequest)
        guard generation == loadGeneration else { return }
        allDeals = page.items
        dealsByID = Dictionary(uniqueKeysWithValues: page.items.map { ($0.id, $0) })
        loadState = .loaded
    } catch is CancellationError {
        return
    } catch {
        guard generation == loadGeneration else { return }
        loadState = .failed(error.localizedDescription)
    }
}
```

Delete or adapt campus-only live properties and mutation methods. Keep a
temporary computed `currentCampus` only if untouched rendering helpers still
require it during this task; remove it before Task 6 completes.

- [ ] **Step 6: Run focused tests and verify pass**

Run the command from Step 2.

Expected: focused suites pass, including stale-response rejection.

- [ ] **Step 7: Commit**

```bash
git add Dealy/Services/DealServicing.swift \
  Dealy/Services/API/APIConfig.swift \
  Dealy/Services/API/RemoteDealService.swift \
  Dealy/Services/MockDealService.swift \
  Dealy/Services/DealFilter.swift \
  Dealy/ViewModels/AppState.swift \
  DealyTests/AppStateTests.swift \
  DealyTests/DealFilterTests.swift \
  DealyTests/RemoteDealServiceTests.swift
git commit -m "feat: load deals from shared discovery state"
```

---

### Task 4: Extend the Backend to 100 Miles and Add Online Feed

**Files:**
- Modify: `backend/src/deals/deal.dto.ts`
- Modify: `backend/src/feeds/feeds.service.ts`
- Modify: `backend/src/feeds/feeds.controller.ts`
- Modify: `backend/test/deals-feeds.e2e-spec.ts`
- Modify: `backend/docs/openapi.json`

**Interfaces:**
- Produces: `GET /v1/feeds/nearby` accepting `radiusMiles=1...100`.
- Produces: `GET /v1/feeds/online?limit=&cursor=` returning active online deals only.

- [ ] **Step 1: Write failing e2e tests**

Add:

```typescript
it('accepts the full 100-mile nearby radius and rejects 101', async () => {
  const accepted = await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=100`);
  expect(accepted.statusCode).toBe(200);

  const rejected = await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=101`);
  expect(rejected.statusCode).toBe(400);
});

it('returns active online deals only from the online feed', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/feeds/online?limit=50' });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { items: DealItem[]; nextCursor: string | null };
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items.every((deal) => deal.isOnline)).toBe(true);
  expect(body.items.every((deal) => deal.distanceMiles === null)).toBe(true);
});

it('paginates online deals without overlap', async () => {
  const first = await app.inject({ method: 'GET', url: '/v1/feeds/online?limit=2' });
  const p1 = first.json() as { items: DealItem[]; nextCursor: string | null };
  expect(p1.nextCursor).toBeTruthy();
  const second = await app.inject({
    method: 'GET',
    url: `/v1/feeds/online?limit=2&cursor=${encodeURIComponent(p1.nextCursor!)}`,
  });
  const p2 = second.json() as { items: DealItem[] };
  const firstIds = new Set(p1.items.map((item) => item.id));
  expect(p2.items.some((item) => firstIds.has(item.id))).toBe(false);
});
```

- [ ] **Step 2: Run the backend test and verify failure**

Run:

```bash
cd backend
pnpm test:e2e -- deals-feeds.e2e-spec.ts --runInBand
```

Expected: 100-mile validation and `/v1/feeds/online` tests fail.

- [ ] **Step 3: Implement the contract**

Change `NearbyFeedQuery.radiusMiles` to `@Max(100)`.

Add an `OnlineFeedQuery` with:

```typescript
export class OnlineFeedQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
```

Implement `FeedsService.online(q)` with Prisma:

- `status = published`;
- `expiresAt > now`;
- `isOnline = true`;
- order by `createdAt DESC, id DESC`;
- fetch `limit + 1`;
- use an opaque cursor containing `createdAt` and `id`;
- map with `mapPrismaDeal(row, null)`.

Add a public `GET online` controller action.

- [ ] **Step 4: Run backend quality checks**

Run:

```bash
cd backend
pnpm test:e2e -- deals-feeds.e2e-spec.ts --runInBand
pnpm typecheck
pnpm lint
pnpm build
pnpm openapi:export
```

Expected: all commands exit 0 and `backend/docs/openapi.json` includes
`/v1/feeds/online` plus a nearby maximum of 100.

- [ ] **Step 5: Commit only feed-related backend files**

```bash
git add backend/src/deals/deal.dto.ts \
  backend/src/feeds/feeds.service.ts \
  backend/src/feeds/feeds.controller.ts \
  backend/test/deals-feeds.e2e-spec.ts \
  backend/docs/openapi.json
git commit -m "feat: add online deals feed"
```

Before committing, run `git diff --cached --name-only` and confirm no unrelated
provider/config files are staged.

---

### Task 5: Build the Onboarding Location Permission and Fallback Flow

**Files:**
- Modify: `Dealy/Views/Onboarding/OnboardingFlow.swift`
- Modify: `Dealy/Views/Onboarding/OnboardingLocationView.swift`
- Modify: `Dealy/Views/Onboarding/OnboardingConfirmView.swift`
- Create: `Dealy/Views/Location/LocationSearchResultsView.swift`
- Modify: `DealyTests/AppStateTests.swift`

**Interfaces:**
- Consumes: `AppState.refreshFromDeviceLocation()`, `resolvePlaces(_:)`, and `applyDiscovery(_:)`.
- Produces: a validated `DiscoveryPreference` draft passed through onboarding.

- [ ] **Step 1: Write failing onboarding-state tests**

Test AppState-facing behavior instead of snapshotting SwiftUI:

```swift
func testDeviceLocationCanCompleteOnboarding() async throws {
    let center = DiscoveryCenter(
        latitude: 47.6062,
        longitude: -122.3321,
        displayName: "Current location",
        source: .device
    )
    let app = makeApp(
        locationProvider: MockLocationProvider(
            authorization: .authorizedWhenInUse,
            result: .success(center)
        )
    )

    try await app.refreshFromDeviceLocation()
    app.completeOnboarding(interests: [.food])

    XCTAssertTrue(app.hasCompletedOnboarding)
    XCTAssertEqual(app.discovery.center, center)
    XCTAssertEqual(app.discovery.radiusMiles, 10)
}

func testManualCandidateCanReplaceDeniedDeviceLocation() async throws {
    let candidate = PlaceCandidate(
        displayName: "Chicago, IL",
        latitude: 41.8781,
        longitude: -87.6298
    )
    let app = makeApp(
        locationProvider: MockLocationProvider(authorization: .denied, result: .failure(.denied)),
        placeResolver: MockPlaceResolver(result: .success([candidate]))
    )
    let results = try await app.resolvePlaces("60601")
    await app.applyDiscovery(.nearby(center: results[0].center, radiusMiles: 10))
    XCTAssertEqual(app.discovery.center.displayName, "Chicago, IL")
}
```

- [ ] **Step 2: Run the focused AppState tests and verify failure**

Run:

```bash
xcodegen generate
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData \
  -only-testing:DealyTests/AppStateTests test
```

Expected: onboarding APIs or assertions fail.

- [ ] **Step 3: Reshape onboarding state**

In `OnboardingFlow`, replace `selectedCampus` and campus-default radius state
with:

```swift
@State private var discovery = DiscoveryPreference.default
```

`OnboardingLocationView` receives `@Binding var discovery`. Its UI must contain:

- a pre-permission explanation;
- `Use my current location`;
- progress while resolving;
- typed denied/restricted/unavailable copy;
- city/ZIP text field;
- Search action;
- candidate list when multiple places resolve;
- 1–100 mile `RadiusControl`;
- Continue disabled until a valid nearby center is selected.

Do not make location permission mandatory.

- [ ] **Step 4: Update confirmation and completion**

Change confirmation inputs to:

```swift
let discovery: DiscoveryPreference
let interests: Set<DealCategory>
```

Display:

- the center display name;
- `Within N miles` for Nearby;
- `Online deals anywhere` for Anywhere.

Change onboarding completion to persist the already-selected discovery:

```swift
func completeOnboarding(interests: Set<DealCategory>) {
    persisted.hasCompletedOnboarding = true
    persisted.interests = interests
    persist()
}
```

The location step must call `await app.applyDiscovery(discovery)` before moving
to interests so the initial deck is already loading.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData \
  -only-testing:DealyTests/AppStateTests test
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add Dealy/Views/Onboarding/OnboardingFlow.swift \
  Dealy/Views/Onboarding/OnboardingLocationView.swift \
  Dealy/Views/Onboarding/OnboardingConfirmView.swift \
  Dealy/Views/Location/LocationSearchResultsView.swift \
  Dealy/ViewModels/AppState.swift \
  DealyTests/AppStateTests.swift
git commit -m "feat: onboard with current or manual location"
```

---

### Task 6: Move Discovery Controls into Search and Refresh Home Immediately

**Files:**
- Modify: `Dealy/Views/Location/LocationSelectorView.swift`
- Modify: `Dealy/Components/RadiusControl.swift`
- Modify: `Dealy/Views/Explore/ExploreView.swift`
- Modify: `Dealy/Views/Home/HomeView.swift`
- Modify: `Dealy/ViewModels/HomeFeedViewModel.swift`
- Modify: `Dealy/Views/Profile/ProfileSheets.swift`
- Modify: `Dealy/Views/Map/DealsMapView.swift`
- Modify: `DealyTests/AppStateTests.swift`
- Modify: `DealyTests/DealFilterTests.swift`

**Interfaces:**
- Consumes: global `AppState.discovery` and `applyDiscovery(_:)`.
- Produces: one atomic Search-owned editor for Nearby/Anywhere.

- [ ] **Step 1: Write failing shared-state and eligibility tests**

Add:

```swift
func testChangingSearchDiscoveryPreservesSavedDeals() async {
    let app = makeApp()
    await app.loadDeals()
    app.save("food-bogo-pizza")
    let replacement = DiscoveryPreference.nearby(
        center: .legacyCampus(.uga),
        radiusMiles: 25
    )

    await app.applyDiscovery(replacement)

    XCTAssertEqual(app.discovery, replacement)
    XCTAssertTrue(app.isSaved("food-bogo-pizza"))
}

func testAnywhereEligibilityExcludesPhysicalDeals() {
    let deals = [onlineDeal, localDeal]
    XCTAssertEqual(
        DealFilter.byDiscovery(deals, preference: .default.switching(to: .anywhere)).map(\.id),
        [onlineDeal.id]
    )
}
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData \
  -only-testing:DealyTests/AppStateTests \
  -only-testing:DealyTests/DealFilterTests test
```

Expected: missing `byDiscovery` or old UI dependencies prevent pass/build.

- [ ] **Step 3: Implement the Search-owned location sheet**

`LocationSelectorView` starts with:

```swift
@State private var draft: DiscoveryPreference
@State private var query = ""
@State private var candidates: [PlaceCandidate] = []
@State private var isResolving = false
@State private var errorMessage: String?
```

Required controls:

- segmented `Nearby` / `Anywhere`;
- current-location button;
- city/ZIP input and candidate results;
- radius slider visible only for Nearby;
- Apply button.

On Apply:

```swift
Task {
    await app.applyDiscovery(draft)
    dismiss()
}
```

Do not mutate global discovery while the sheet is still being edited.

- [ ] **Step 4: Connect Explore and Home**

In Explore:

- add a visible location/radius chip near the search surface;
- open `LocationSelectorView` from that chip;
- use `app.allDeals` directly because the service now returns eligible inventory;
- keep category/text filtering local;
- show `Online anywhere` when mode is Anywhere.

In Home:

- observe `app.discovery` instead of campus ID/radius separately;
- rebuild the deck when the global feed finishes loading;
- remove location controls from `HomeFilterSheet` if present;
- display an approximate distance only on local cards;
- for `.noneInArea`, provide `Widen range` and `Browse online` actions rather
  than silently expanding.

`Browse online` calls:

```swift
Task {
    await app.applyDiscovery(app.discovery.switching(to: .anywhere))
}
```

`HomeFeedViewModel` must not reapply campus-tag filtering to server-filtered
inventory. It filters active/category/advanced/unseen and ranks the result.

- [ ] **Step 5: Gate the existing map as a Dealy+ preview**

For this implementation, preserve the current map code but make the free entry
show a noninteractive preview surface:

- a few visible/obscured pins;
- `Unlock the full deal map with Dealy+`;
- no pan, zoom, pin selection, or `Search this area`.

Do not implement subscription entitlement or the full interactive map in this
task; route the unlock action to the existing Dealy+ preview.

- [ ] **Step 6: Run tests and full iOS build**

Run:

```bash
xcodegen generate
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData test
```

Expected: all iOS unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add Dealy/Views/Location/LocationSelectorView.swift \
  Dealy/Components/RadiusControl.swift \
  Dealy/Views/Explore/ExploreView.swift \
  Dealy/Views/Home/HomeView.swift \
  Dealy/ViewModels/HomeFeedViewModel.swift \
  Dealy/Views/Profile/ProfileSheets.swift \
  Dealy/Views/Map/DealsMapView.swift \
  Dealy/Services/DealFilter.swift \
  DealyTests/AppStateTests.swift \
  DealyTests/DealFilterTests.swift
git commit -m "feat: control global discovery from search"
```

---

### Task 7: Wire the Shipping App, Add Interaction Signals, and Verify End to End

**Files:**
- Modify: `Dealy/App/DealyApp.swift`
- Modify: `Dealy/ViewModels/AppState.swift`
- Modify: `Dealy/Views/Home/HomeView.swift`
- Modify: `Dealy/Views/Explore/ExploreView.swift`
- Modify: `Dealy/Views/Shared/DealDetailView.swift`
- Modify: `Dealy/Services/API/RemoteDealService.swift`
- Modify: `README.md`
- Modify: `backend/docs/mobile-integration.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: completed discovery-aware iOS and backend contracts.
- Produces: shipping dependency wiring and explicit interaction events suitable for later personalization.

- [ ] **Step 1: Add failing interaction-event tests**

Define a narrow analytics boundary:

```swift
enum DealInteractionEvent: Equatable {
    case impression(dealID: String)
    case opened(dealID: String)
    case swiped(dealID: String, direction: SwipeDirection)
    case redemptionClicked(dealID: String)
    case markedUsed(dealID: String)
}

protocol DealInteractionRecording {
    func record(_ event: DealInteractionEvent)
}
```

Add a recording mock and tests asserting:

- swipe records direction;
- opening detail records `.opened`;
- Get Deal records `.redemptionClicked`;
- mark used records `.markedUsed`;
- changing location records none of these and preserves historical signals.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData \
  -only-testing:DealyTests/AppStateTests test
```

Expected: analytics interface and events do not exist.

- [ ] **Step 3: Implement interaction recording without an LLM**

Inject a `DealInteractionRecording` implementation into `AppState`. Use a
no-op/local implementation until authenticated backend event sync is enabled.
Record events at existing action boundaries; do not add AI calls or ranking
side effects.

- [ ] **Step 4: Wire production dependencies**

In `DealyApp`, choose the service from environment:

```swift
@State private var appState: AppState

init() {
    let useRemote = ProcessInfo.processInfo.environment["DEALY_API_ENV"] != nil
    let service: DealServicing = useRemote
        ? RemoteDealService()
        : MockDealService()
    _appState = State(initialValue: AppState(
        dealService: service,
        locationProvider: CoreLocationProvider(),
        placeResolver: ApplePlaceResolver()
    ))
}
```

Keep mock data as the default for previews and local development without a
backend environment. Document how to run against local API.

- [ ] **Step 5: Update documentation and ignore companion artifacts**

Update README with:

- no paid location API required;
- Core Location permission behavior;
- city/ZIP fallback;
- `DEALY_API_ENV=local`;
- Nearby versus Anywhere API routes;
- 1–100 mile radius;
- simulator location testing.

Update `backend/docs/mobile-integration.md` with exact query examples.

Add:

```gitignore
.superpowers/
```

to `.gitignore` so visual-companion artifacts are not committed.

- [ ] **Step 6: Run complete verification**

Run:

```bash
cd backend
pnpm test
pnpm test:e2e -- --runInBand
pnpm typecheck
pnpm lint
pnpm build

cd ..
xcodegen generate
xcodebuild -project Dealy.xcodeproj -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath .derivedData test
git diff --check
git status --short
```

Expected:

- every backend command exits 0;
- all iOS tests pass;
- no whitespace errors;
- only intentional task files plus the user's unrelated pre-existing backend
  changes appear in status.

- [ ] **Step 7: Manual simulator verification**

Run the app in an iPhone simulator and verify:

1. Fresh install → allow location → center becomes simulator location.
2. Fresh install → deny location → city/ZIP fallback completes onboarding.
3. Search → change radius to 25 → Home reloads without reopening.
4. Search → change city → Home shows the new feed and existing saves remain.
5. Switch to Anywhere → only online cards appear.
6. Empty local deck offers wider range or Anywhere.
7. Free map entry shows a Dealy+ preview and cannot interact.
8. Relaunch preserves mode, center, radius, saves, and swipe history.

- [ ] **Step 8: Commit**

```bash
git add Dealy/App/DealyApp.swift \
  Dealy/ViewModels/AppState.swift \
  Dealy/Views/Home/HomeView.swift \
  Dealy/Views/Explore/ExploreView.swift \
  Dealy/Views/Shared/DealDetailView.swift \
  Dealy/Services/API/RemoteDealService.swift \
  README.md \
  backend/docs/mobile-integration.md \
  .gitignore \
  DealyTests/AppStateTests.swift
git commit -m "feat: finish location-first discovery"
```

---

## Final Acceptance Checklist

- [ ] Device location works with `When In Use` permission only.
- [ ] Denied location has a complete city/ZIP fallback.
- [ ] Default radius is 10; bounds are 1 and 100.
- [ ] Search owns location controls and applies changes atomically.
- [ ] Home refreshes immediately from the same global discovery preference.
- [ ] Nearby excludes online and out-of-radius inventory.
- [ ] Anywhere returns online-only inventory.
- [ ] Stale requests cannot replace a newer location's feed.
- [ ] Saved deals and swipe history survive migration and location changes.
- [ ] Map remains a Dealy+ preview, not a free interactive feature.
- [ ] Interaction signals exist for later personalization and Ask Dealy.
- [ ] No paid third-party location API or background location is introduced.
- [ ] Backend and iOS test suites pass.
