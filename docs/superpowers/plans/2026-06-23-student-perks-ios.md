# Student Perks — iOS (3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface curated online student programs in a Student Perks section (Explore) backed by `/v1/feeds/student`, and bridge them to physical redemption with a MapKit `MKLocalSearch` "Find Nearby Stores" finder.

**Architecture:** Add `redemptionBrand` to the iOS `Deal`/`DealDTO`; add a `.student` feed request routed to `GET /v1/feeds/student`; hold `studentDeals` in `AppState`; render a Student Perks section + See-all list in Explore; add detail-view "Get Deal Online" (opens the official URL) and "Find Nearby Stores" (a protocol-abstracted, testable MapKit finder rendered as a map+list sheet).

**Tech Stack:** Swift 5 / SwiftUI (iOS 17), MapKit (`MKLocalSearch`), CoreLocation, XCTest, XcodeGen (new files under `Dealy/` and `DealyTests/` auto-included on `xcodegen generate`). Build/test: `xcodebuild ... -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`.

## Global Constraints

- **REAL DATA ONLY** — no fabricated stores or opening hours. Hours are deferred to Apple Maps via Directions.
- Student/online inventory is **always available** regardless of campus/location (never gated).
- Curated programs render as `curated`, **never** a Verified badge (already enforced server-side; the client just shows what it's given).
- `redemptionBrand` and `.student` are additive; existing constructors/switches must keep compiling (Swift enforces switch exhaustiveness — update every `DealFeedRequest` switch).
- TDD, frequent commits. After any new file: `xcodegen generate` before building.

---

### Task 1: `redemptionBrand` on the iOS model + DTO

**Files:**
- Modify: `Dealy/Models/Deal.swift`
- Modify: `Dealy/Services/API/DealDTO.swift`
- Test: `DealyTests/DealDTOMappingTests.swift` (append)

**Interfaces:**
- Produces: `Deal.redemptionBrand: String?` (default nil); `DealDTO.redemptionBrand: String?` mapped through `toDeal()`.

- [ ] **Step 1: Write the failing test**

```swift
// Append to DealyTests/DealDTOMappingTests.swift
func testDecodesRedemptionBrandWhenPresentAndAbsent() throws {
    let withBrand = #"{"items":[{"id":"s1","title":"Apple Education","merchant":"Apple","category":"tech","currentPrice":0,"originalPrice":0,"currency":"USD","dealScore":80,"isOnline":true,"isStudentOnly":true,"redemptionBrand":"Apple Store","shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":"https://www.apple.com/us-edu/store","latitude":null,"longitude":null,"locationTags":["online","nationwide"],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
    let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: withBrand)
    XCTAssertEqual(page.items[0].toDeal().redemptionBrand, "Apple Store")

    let withoutBrand = #"{"items":[{"id":"s2","title":"Spotify","merchant":"Spotify","category":"entertainment","currentPrice":0,"originalPrice":0,"currency":"USD","dealScore":80,"isOnline":true,"isStudentOnly":true,"shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":"https://www.spotify.com/us/student/","latitude":null,"longitude":null,"locationTags":["online","nationwide"],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
    let page2 = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: withoutBrand)
    XCTAssertNil(page2.items[0].toDeal().redemptionBrand)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/DealDTOMappingTests`
Expected: FAIL — `Deal`/`DealDTO` has no member `redemptionBrand`.

- [ ] **Step 3: Add the field to `Deal`**

In `Dealy/Models/Deal.swift`, after `var isTrending: Bool = false`:

```swift
    /// Brand to search for physical redemption (e.g. "Apple Store"); nil = online-only.
    var redemptionBrand: String? = nil
```

- [ ] **Step 4: Add to `DealDTO` + `toDeal()`**

In `Dealy/Services/API/DealDTO.swift`, add a decoded field (after `let destinationUrl: String?`):

```swift
    let redemptionBrand: String?
```

and in `toDeal()`, after `isTrending: isTrending ?? false`:

```swift
            ,
            redemptionBrand: redemptionBrand
```

(Place the comma correctly: the new argument goes after the current last argument `isTrending: isTrending ?? false`.)

- [ ] **Step 5: Run to verify pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/DealDTOMappingTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Dealy/Models/Deal.swift Dealy/Services/API/DealDTO.swift DealyTests/DealDTOMappingTests.swift Dealy.xcodeproj
git commit -m "feat(ios): add redemptionBrand to Deal + DTO"
```

---

### Task 2: `.student` feed request + service routing

**Files:**
- Modify: `Dealy/Services/DealServicing.swift` (`DealFeedRequest`)
- Modify: `Dealy/Services/API/RemoteDealService.swift`
- Modify: `Dealy/Services/MockDealService.swift`
- Test: `DealyTests/RemoteDealServiceTests.swift` (append)

**Interfaces:**
- Produces: `DealFeedRequest.student`; `RemoteDealService` GETs `/v1/feeds/student`; `MockDealService` returns student-only deals for `.student`.

- [ ] **Step 1: Write the failing test**

```swift
// Append to DealyTests/RemoteDealServiceTests.swift
func testStudentRoutesToStudentFeed() async throws {
    StubURLProtocol.reset()
    StubURLProtocol.responder = { path in
        XCTAssertEqual(path, "/v1/feeds/student")
        return Self.page(ids: ["s1", "s2"], online: true)
    }
    let service = RemoteDealService(client: Self.stubbedClient())
    let page = try await service.fetchDeals(for: .student)
    XCTAssertEqual(page.items.map(\.id), ["s1", "s2"])
}
```

> NOTE: Read the existing `Self.page(ids:online:)` helper in this file — match its exact signature. If it doesn't already emit `isStudentOnly`, that's fine; this test only asserts routing + ids. Student feed must NOT drop online deals (unlike nearby), so all returned ids survive.

- [ ] **Step 2: Run it to verify it fails**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/RemoteDealServiceTests`
Expected: FAIL — `DealFeedRequest` has no `.student`.

- [ ] **Step 3: Add the enum case**

In `Dealy/Services/DealServicing.swift`:

```swift
enum DealFeedRequest: Equatable, Sendable {
    case nearby(DiscoveryPreference)
    case anywhere
    case student
}
```

- [ ] **Step 4: Route it in `RemoteDealService`**

In `RemoteDealService.fetchDeals`, add a case (do not filter online — student programs are online):

```swift
            case .student:
                let page = try await client.get(
                    "/v1/feeds/student",
                    query: [URLQueryItem(name: "limit", value: "50")],
                    as: DealPageDTO.self
                )
                return DealPage(items: page.items.map { $0.toDeal() }, nextCursor: page.nextCursor)
```

- [ ] **Step 5: Handle `.student` in `MockDealService`**

In `MockDealService.fetchDeals`, the `switch request` currently has `.nearby`/`.anywhere`. Add a `.student` branch BEFORE the discovery mapping that returns the student-only subset:

```swift
        if case .student = request {
            let students = MockDeals.dataset(reference: reference)
                .filter { $0.isStudentOnly }
                .map { d -> Deal in var x = d; x.verified = false; return x }
            return DealPage(items: students, nextCursor: nil)
        }
```

> NOTE: If `MockDeals.dataset` has no `isStudentOnly` deals, add 2 student programs to `MockDeals` (online, `isStudentOnly: true`, one with `redemptionBrand: "Apple Store"`, one without) so previews/offline render. These are the dev double, not shipped inventory.

- [ ] **Step 6: Run to verify pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/RemoteDealServiceTests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Dealy/Services/DealServicing.swift Dealy/Services/API/RemoteDealService.swift Dealy/Services/MockDealService.swift Dealy/Data/MockDeals.swift DealyTests/RemoteDealServiceTests.swift Dealy.xcodeproj
git commit -m "feat(ios): .student feed request routed to /v1/feeds/student"
```

---

### Task 3: `AppState.studentDeals` + `loadStudentDeals()`

**Files:**
- Modify: `Dealy/ViewModels/AppState.swift`
- Test: `DealyTests/AppStateTests.swift` (append)

**Interfaces:**
- Consumes: `dealService.fetchDeals(for: .student)`.
- Produces: `AppState.studentDeals: [Deal]`; `AppState.loadStudentDeals() async`; loaded deals resolvable via `deal(id:)`.

- [ ] **Step 1: Write the failing test**

```swift
// Append inside AppStateTests (before the class-closing brace)
func testLoadStudentDealsPopulatesAndResolves() async {
    let app = makeApp()
    await app.loadStudentDeals()
    XCTAssertFalse(app.studentDeals.isEmpty)
    XCTAssertTrue(app.studentDeals.allSatisfy { $0.isStudentOnly })
    // Resolvable for detail/save/watch lookups.
    let id = app.studentDeals[0].id
    XCTAssertNotNil(app.deal(id: id))
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/AppStateTests`
Expected: FAIL — no member `studentDeals`/`loadStudentDeals`.

- [ ] **Step 3: Implement in `AppState`**

Add a stored property near `allDeals`:

```swift
    private(set) var studentDeals: [Deal] = []
```

And a loader (near `loadDeals`):

```swift
    /// Load curated national student programs for the Student Perks section.
    /// Independent of the main deck; failures leave the section empty (the UI
    /// shows an empty state) and never block the app.
    @MainActor
    func loadStudentDeals() async {
        do {
            let page = try await dealService.fetchDeals(for: .student)
            studentDeals = page.items
            for deal in page.items { dealsByID[deal.id] = deal }
        } catch {
            studentDeals = []
        }
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/AppStateTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/ViewModels/AppState.swift DealyTests/AppStateTests.swift
git commit -m "feat(ios): AppState.studentDeals + loadStudentDeals()"
```

---

### Task 4: `NearbyStoresService` (testable MapKit finder)

**Files:**
- Create: `Dealy/Services/NearbyStoresService.swift`
- Modify: `Dealy/ViewModels/AppState.swift` (inject `nearbyStores`)
- Modify: `Dealy/App/DealyApp.swift` (wire `MapKitNearbyStoresService` in production)
- Test: `DealyTests/NearbyStoresServiceTests.swift`

**Interfaces:**
- Produces:
  - `struct NearbyStore: Identifiable, Equatable { id,name,address,distanceMiles,phone:String?,url:URL?,latitude,longitude }`
  - `protocol NearbyStoreSearching { func search(brand:String, near:CLLocationCoordinate2D) async throws -> [NearbyStore] }`
  - `enum NearbyStores { static func sortedByDistance(_:) ; static func make(name:address:phone:url:lat:lng:origin:) -> NearbyStore }`
  - `final class MapKitNearbyStoresService`, `struct MockNearbyStoresService`
  - `AppState.nearbyStores: NearbyStoreSearching`

- [ ] **Step 1: Write the failing tests**

```swift
// DealyTests/NearbyStoresServiceTests.swift
import XCTest
import CoreLocation
@testable import Dealy

final class NearbyStoresServiceTests: XCTestCase {
    private let atl = CLLocationCoordinate2D(latitude: 33.7531, longitude: -84.3857)

    func testMakeComputesDistanceMilesFromOrigin() {
        // ~ same point → ~0 mi; a point ~1 deg lat north → ~69 mi.
        let here = NearbyStores.make(name: "Apple Lenox", address: "A", phone: nil, url: nil,
                                     lat: 33.7531, lng: -84.3857, origin: atl)
        XCTAssertLessThan(here.distanceMiles, 1.0)
        let far = NearbyStores.make(name: "Apple Far", address: "B", phone: nil, url: nil,
                                    lat: 34.7531, lng: -84.3857, origin: atl)
        XCTAssertEqual(far.distanceMiles, 69, accuracy: 3)
    }

    func testSortedByDistanceIsNearestFirst() {
        let a = NearbyStores.make(name: "far", address: "", phone: nil, url: nil, lat: 34.75, lng: -84.39, origin: atl)
        let b = NearbyStores.make(name: "near", address: "", phone: nil, url: nil, lat: 33.76, lng: -84.39, origin: atl)
        let sorted = NearbyStores.sortedByDistance([a, b])
        XCTAssertEqual(sorted.map(\.name), ["near", "far"])
    }

    func testMockReturnsCannedStores() async throws {
        let mock = MockNearbyStoresService(stores: [
            NearbyStores.make(name: "Apple Lenox", address: "3393 Peachtree", phone: "404", url: nil,
                              lat: 33.84, lng: -84.36, origin: atl),
        ])
        let results = try await mock.search(brand: "Apple Store", near: atl)
        XCTAssertEqual(results.map(\.name), ["Apple Lenox"])
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/NearbyStoresServiceTests`
Expected: FAIL — `NearbyStores`/`NearbyStore` not found.

- [ ] **Step 3: Implement the service**

```swift
// Dealy/Services/NearbyStoresService.swift
import CoreLocation
import Foundation
import MapKit

/// A physical store where an online student deal can be redeemed in person.
struct NearbyStore: Identifiable, Equatable {
    let id: String
    let name: String
    let address: String
    let distanceMiles: Double
    let phone: String?
    let url: URL?
    let latitude: Double
    let longitude: Double
}

/// Finds physical stores for a brand near a coordinate. Protocol-abstracted so
/// tests/previews never touch real MapKit.
protocol NearbyStoreSearching {
    func search(brand: String, near coordinate: CLLocationCoordinate2D) async throws -> [NearbyStore]
}

/// Pure helpers (unit-tested without MapKit).
enum NearbyStores {
    static func make(name: String, address: String, phone: String?, url: URL?,
                     lat: Double, lng: Double, origin: CLLocationCoordinate2D) -> NearbyStore {
        let meters = CLLocation(latitude: lat, longitude: lng)
            .distance(from: CLLocation(latitude: origin.latitude, longitude: origin.longitude))
        return NearbyStore(
            id: "\(name)|\(lat),\(lng)",
            name: name, address: address,
            distanceMiles: meters / 1609.344,
            phone: phone, url: url, latitude: lat, longitude: lng
        )
    }

    static func sortedByDistance(_ stores: [NearbyStore]) -> [NearbyStore] {
        stores.sorted { $0.distanceMiles != $1.distanceMiles ? $0.distanceMiles < $1.distanceMiles : $0.id < $1.id }
    }
}

/// Live MapKit implementation — the only untested shell.
final class MapKitNearbyStoresService: NearbyStoreSearching {
    func search(brand: String, near coordinate: CLLocationCoordinate2D) async throws -> [NearbyStore] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = brand
        request.region = MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.4, longitudeDelta: 0.4)
        )
        let response = try await MKLocalSearch(request: request).start()
        let stores = response.mapItems.compactMap { item -> NearbyStore? in
            let c = item.placemark.coordinate
            guard CLLocationCoordinate2DIsValid(c) else { return nil }
            return NearbyStores.make(
                name: item.name ?? brand,
                address: item.placemark.title ?? "",
                phone: item.phoneNumber,
                url: item.url,
                lat: c.latitude, lng: c.longitude,
                origin: coordinate
            )
        }
        return NearbyStores.sortedByDistance(stores)
    }
}

/// Deterministic double for tests/previews.
struct MockNearbyStoresService: NearbyStoreSearching {
    var stores: [NearbyStore] = []
    func search(brand: String, near coordinate: CLLocationCoordinate2D) async throws -> [NearbyStore] {
        NearbyStores.sortedByDistance(stores)
    }
}
```

- [ ] **Step 4: Inject into `AppState`**

Add a dependency + accessor (mirror `redemptionHandler`):

```swift
    let nearbyStores: NearbyStoreSearching
```

Add `nearbyStores: NearbyStoreSearching = MockNearbyStoresService()` to the `init` parameter list and assign `self.nearbyStores = nearbyStores`.

- [ ] **Step 5: Wire MapKit impl in production**

In `Dealy/App/DealyApp.swift`, pass `nearbyStores: MapKitNearbyStoresService()` into the `AppState(...)` initializer.

- [ ] **Step 6: Run to verify pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/NearbyStoresServiceTests`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add Dealy/Services/NearbyStoresService.swift Dealy/ViewModels/AppState.swift Dealy/App/DealyApp.swift DealyTests/NearbyStoresServiceTests.swift Dealy.xcodeproj
git commit -m "feat(ios): testable MapKit NearbyStoresService"
```

---

### Task 5: Student Perks section + See-all list (Explore)

**Files:**
- Create: `Dealy/Views/StudentPerks/StudentPerksSection.swift`
- Create: `Dealy/Views/StudentPerks/StudentPerksListView.swift`
- Modify: `Dealy/Views/Explore/ExploreView.swift`

**Interfaces:**
- Consumes: `app.studentDeals`, `app.loadStudentDeals()`, `DealRowCard`, `SectionHeader`, `EmptyStateView`.

- [ ] **Step 1: Create `StudentPerksListView`**

```swift
// Dealy/Views/StudentPerks/StudentPerksListView.swift
import SwiftUI

/// Full vertical list of curated student programs. Pushed from the Explore
/// "Student Perks" section's "See all". Tapping a row opens the detail sheet.
struct StudentPerksListView: View {
    @Environment(AppState.self) private var app
    @State private var selected: Deal?

    var body: some View {
        ScrollView {
            if app.studentDeals.isEmpty {
                EmptyStateView(symbol: "graduationcap",
                               title: "No student perks yet",
                               message: "We’re curating verified student programs. Check back soon.")
                    .padding(.top, Spacing.xl)
            } else {
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(app.studentDeals) { deal in
                        DealRowCard(deal: deal) { app.recordOpened(deal.id); selected = deal }
                    }
                }
                .padding(Spacing.lg)
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Student Perks")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selected) { DealDetailView(deal: $0) }
    }
}
```

- [ ] **Step 2: Create `StudentPerksSection`**

```swift
// Dealy/Views/StudentPerks/StudentPerksSection.swift
import SwiftUI

/// Explore section: a few curated student programs with a "See all" push.
/// Renders nothing when there are no programs (keeps Explore clean).
struct StudentPerksSection: View {
    let deals: [Deal]
    let onSelect: (Deal) -> Void

    var body: some View {
        if !deals.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack {
                    SectionHeader(title: "Student Perks", symbol: "graduationcap.fill")
                    Spacer()
                    NavigationLink {
                        StudentPerksListView()
                    } label: {
                        Text("See all").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.primary)
                    }
                }
                .padding(.horizontal, Spacing.lg)

                LazyVStack(spacing: Spacing.sm) {
                    ForEach(deals.prefix(4)) { deal in
                        DealRowCard(deal: deal) { onSelect(deal) }
                    }
                }
                .padding(.horizontal, Spacing.lg)
            }
        }
    }
}
```

> NOTE: Confirm `SectionHeader(title:symbol:)` and `DealRowCard(deal:onTap:)` signatures from `Dealy/Components/`. If `SectionHeader` doesn't accept a trailing accessory, the `HStack { SectionHeader; Spacer; NavigationLink }` wrapper above still works since it composes them externally.

- [ ] **Step 3: Wire into `ExploreView`**

In `ExploreView`, add `StudentPerksSection` to `curatedSections` (it only renders when non-empty), and load on appear. Add to the `body`'s `.background(...)` chain:

```swift
            .task { await app.loadStudentDeals() }
```

In `curatedSections`, prepend:

```swift
            StudentPerksSection(deals: app.studentDeals) { deal in
                app.recordOpened(deal.id); selectedDeal = deal
            }
```

(Use the existing `selectedDeal` state + `.sheet(item: $selectedDeal)` already present.)

- [ ] **Step 4: Build + smoke test**

Run: `xcodegen generate && xcodebuild build -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Views/StudentPerks Dealy/Views/Explore/ExploreView.swift Dealy.xcodeproj
git commit -m "feat(ios): Student Perks section + See-all list in Explore"
```

---

### Task 6: Detail actions — Get Deal Online + Find Nearby Stores

**Files:**
- Create: `Dealy/Views/StudentPerks/NearbyStoresSheet.swift`
- Modify: `Dealy/Views/Shared/DealDetailView.swift` (action bar + `GetDealSheet` opens URL)

**Interfaces:**
- Consumes: `app.nearbyStores`, `app.discovery.center`, `app.resolveDeviceCenter()`, `deal.redemptionBrand`, `deal.destinationURL`.

- [ ] **Step 1: Create `NearbyStoresSheet`**

```swift
// Dealy/Views/StudentPerks/NearbyStoresSheet.swift
import SwiftUI
import MapKit
import CoreLocation

/// Presents physical stores near the user where an online student deal can be
/// redeemed. Map header + list (Call / Website / Directions). Hours are deferred
/// to Apple Maps via Directions — never fabricated.
struct NearbyStoresSheet: View {
    let brand: String
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var phase: Phase = .loading
    enum Phase: Equatable { case loading, loaded([NearbyStore]), empty, noLocation, failed }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading:
                    ProgressView("Finding \(brand) stores…").frame(maxWidth: .infinity, maxHeight: .infinity)
                case .loaded(let stores):
                    loaded(stores)
                case .empty:
                    EmptyStateView(symbol: "mappin.slash", title: "No \(brand) stores nearby",
                                   message: "We couldn’t find a \(brand) near you. Try the online link instead.")
                case .noLocation:
                    EmptyStateView(symbol: "location.slash", title: "Location needed",
                                   message: "Enable location so we can find \(brand) stores near you.")
                case .failed:
                    EmptyStateView(symbol: "exclamationmark.triangle", title: "Couldn’t search",
                                   message: "Something went wrong finding nearby stores.")
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Nearby \(brand)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Close") { dismiss() } } }
            .task { await load() }
        }
    }

    @ViewBuilder private func loaded(_ stores: [NearbyStore]) -> some View {
        ScrollView {
            Map {
                ForEach(stores) { s in
                    Marker(s.name, coordinate: CLLocationCoordinate2D(latitude: s.latitude, longitude: s.longitude))
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .padding(.horizontal, Spacing.lg)

            LazyVStack(spacing: Spacing.sm) {
                ForEach(stores) { store in NearbyStoreRow(store: store) }
            }
            .padding(Spacing.lg)
        }
    }

    private func load() async {
        guard let origin = await resolveOrigin() else { phase = .noLocation; return }
        do {
            let stores = try await app.nearbyStores.search(brand: brand, near: origin)
            phase = stores.isEmpty ? .empty : .loaded(stores)
        } catch {
            phase = .failed
        }
    }

    /// Prefer a real device fix; fall back to a fresh one-shot; nil if unavailable.
    private func resolveOrigin() async -> CLLocationCoordinate2D? {
        let center = app.discovery.center
        if center.source == .device {
            return CLLocationCoordinate2D(latitude: center.latitude, longitude: center.longitude)
        }
        if let fix = try? await app.resolveDeviceCenter() {
            return CLLocationCoordinate2D(latitude: fix.latitude, longitude: fix.longitude)
        }
        return nil
    }
}

private struct NearbyStoreRow: View {
    let store: NearbyStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack {
                Text(store.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.primaryText)
                Spacer()
                Text(Format.distance(store.distanceMiles, isOnline: false))
                    .font(.caption).foregroundStyle(Theme.mutedText)
            }
            if !store.address.isEmpty {
                Text(store.address).font(.caption).foregroundStyle(Theme.mutedText)
            }
            HStack(spacing: Spacing.md) {
                if let phone = store.phone, let url = URL(string: "tel://\(phone.filter { $0.isNumber })") {
                    Button { openURL(url) } label: { Label("Call", systemImage: "phone.fill") }
                }
                if let url = store.url {
                    Button { openURL(url) } label: { Label("Website", systemImage: "safari.fill") }
                }
                Button { openInMaps() } label: { Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill") }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.primary)
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .dealyCardSurface()
    }

    private func openInMaps() {
        let placemark = MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: store.latitude, longitude: store.longitude))
        let item = MKMapItem(placemark: placemark)
        item.name = store.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
    }
}
```

> NOTE: Confirm `Format.distance(_:isOnline:)` exists (used by `DealRanker`/cards). Confirm `EmptyStateView` init params from `Dealy/Components/EmptyStateView.swift`; adapt labels to its actual signature (it may require `primaryTitle`/`primaryAction` — pass nil or use the convenience init).

- [ ] **Step 2: Add detail-view actions**

In `DealDetailView`, add state `@State private var showNearbyStores = false`. In `actionBar`, after the "Get Deal" button, add:

```swift
            if let brand = deal.redemptionBrand {
                Button {
                    app.recordRedemptionClicked(deal.id)
                    showNearbyStores = true
                    Haptics.impact(.light)
                } label: {
                    Label("Find Nearby \(brand)s", systemImage: "mappin.circle.fill")
                }
                .buttonStyle(GhostButtonStyle(fullWidth: true))
            }
```

And add the sheet alongside the existing `.sheet(isPresented: $showGetDeal)`:

```swift
        .sheet(isPresented: $showNearbyStores) {
            NearbyStoresSheet(brand: deal.redemptionBrand ?? deal.merchant)
        }
```

- [ ] **Step 3: Make "Get Deal Online" actually open the URL**

In `GetDealSheet`, replace the "Backend coming soon" copy path with a real opener when `destinationURL` exists. Add `@Environment(\.openURL) private var openURL` and, when `deal.destinationURL` is a valid URL, render a primary button:

```swift
                if let urlString = deal.destinationURL, let url = URL(string: urlString) {
                    Button {
                        openURL(url)
                    } label: {
                        Label("Get Deal Online", systemImage: "arrow.up.right.square.fill")
                    }
                    .buttonStyle(.primaryDealy)
                    .padding(.horizontal, Spacing.lg)
                }
```

Keep the coupon-reveal block. Replace the "Backend coming soon" `Text` with copy that's honest whether or not a URL exists (e.g. when no URL: "Show this deal at the store to redeem.").

- [ ] **Step 4: Build + test**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
Expected: BUILD SUCCEEDED, full suite passes.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Views/StudentPerks/NearbyStoresSheet.swift Dealy/Views/Shared/DealDetailView.swift Dealy.xcodeproj
git commit -m "feat(ios): detail Get Deal Online + Find Nearby Stores sheet"
```

---

### Task 7: Full verification + run

- [ ] **Step 1: Full test suite**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
Expected: TEST SUCCEEDED — all suites green (new DTO, student-feed, AppState, NearbyStores tests included).

- [ ] **Step 2: Launch + screenshot (per the project run skill)**

Boot the sim against the local backend (or Mock), navigate to Explore → Student Perks → open a program → "Find Nearby Stores". Capture a screenshot to confirm the section, detail actions, and nearby sheet render.

---

## Self-Review

**Spec coverage:**
- `redemptionBrand` on iOS model/DTO → Task 1.
- `.student` feed fetch → Task 2.
- `AppState.studentDeals` → Task 3.
- Testable MapKit finder → Task 4.
- Student Perks section + See-all → Task 5.
- Detail Get Deal Online + Find Nearby Stores (map+list) → Task 6.
- Honest empty/no-location/error states, no fabricated hours → Task 6 (`NearbyStoresSheet` phases; Directions → Apple Maps).
- Tests for DTO/feed/AppState/finder → Tasks 1–4.

**Placeholder scan:** No TBD/TODO. Three `NOTE` blocks point at real component signatures to confirm (`Self.page`, `SectionHeader`/`DealRowCard`, `EmptyStateView`/`Format.distance`) — behavior is fully specified; these exist because the exact param lists live in files the implementer reads.

**Type consistency:** `redemptionBrand: String?`, `DealFeedRequest.student`, `AppState.studentDeals`/`loadStudentDeals()`/`nearbyStores`, `NearbyStore`, `NearbyStores.make/sortedByDistance`, `NearbyStoreSearching.search(brand:near:)` are used identically across tasks and the sheet.

**Scope:** iOS-only; consumes 3a. No backend. The dedicated-tab option was rejected (section in Explore).
