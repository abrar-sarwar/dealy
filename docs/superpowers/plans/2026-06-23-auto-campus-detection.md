# Auto-Campus Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically assign the active campus from device GPS (never ask the user), wire that assignment only into ranking/personalization so it can never gate deal access, and establish the four-class feed blend, first-class TrendingCampusDeals, and a dollars-saved analytics signal.

**Architecture:** A new pure `CampusLocator` value type turns a coordinate (or `nil`) into a three-state `CampusAssignment`. `AppState` exposes that assignment and a manual-override escape hatch; onboarding auto-prepares discovery with no campus prompt; foreground re-detection refreshes the assignment each activation. A pure `InventoryClass` classifier defines the Local/Online/Trending/National blend, and a contract test proves campus state never removes non-local deals. The redemption analytics event carries savings amount, campus context, and inventory class.

**Tech Stack:** Swift 5 / SwiftUI (iOS 17), CoreLocation, XCTest, XcodeGen (`project.yml`, directory-globbed sources — new files under `Dealy/` and `DealyTests/` are picked up on `xcodegen generate`).

## Global Constraints

- **No manual school selection in onboarding.** Campus is auto-assigned; the only manual entry is a demoted Settings correction. (verbatim: "The user should never manually select a school.")
- **Campus assignment can NEVER gate access to deals.** It only reorders/boosts. (verbatim: "Location determines local relevance, NOT access.")
- **Supported campuses for matching:** Georgia State (`gsu`), Georgia Tech (`gt`), Kennesaw State (`ksu`), UGA (`uga`). The `atlanta` (`atl`) entry is a meta-anchor and is **excluded** from matching.
- **No mock/placeholder/fake inventory may be introduced.** Where inventory does not yet exist (Online/National/Trending), build the slot and the contract only.
- **`campusMatchRadiusMiles = 30`** — the campus-match threshold, distinct from any campus `defaultRadius`.
- **TDD, frequent commits.** XCTest, `@testable import Dealy`.
- After any new file: run `xcodegen generate` before building.

---

### Task 1: `CampusLocator` pure value type

**Files:**
- Create: `Dealy/Services/CampusLocator.swift`
- Test: `DealyTests/CampusLocatorTests.swift`

**Interfaces:**
- Consumes: `Campus` (`Dealy/Models/Campus.swift`) static campuses and their `latitude`/`longitude`.
- Produces:
  - `enum CampusAssignment: Equatable { case assigned(Campus, distanceMiles: Double); case outOfRange(nearest: Campus, distanceMiles: Double); case unavailable }`
  - `enum CampusLocator { static let campusMatchRadiusMiles = 30.0; static let matchableCampuses: [Campus]; static func locate(from coordinate: CLLocationCoordinate2D?) -> CampusAssignment }`

- [ ] **Step 1: Write the failing tests**

```swift
// DealyTests/CampusLocatorTests.swift
import XCTest
import CoreLocation
@testable import Dealy

final class CampusLocatorTests: XCTestCase {

    func testNilCoordinateIsUnavailable() {
        XCTAssertEqual(CampusLocator.locate(from: nil), .unavailable)
    }

    func testCoordinateOnCampusAssignsThatCampus() {
        // Standing on Georgia Tech.
        let coord = CLLocationCoordinate2D(latitude: 33.7756, longitude: -84.3963)
        guard case let .assigned(campus, distance) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .assigned")
        }
        XCTAssertEqual(campus.id, "gt")
        XCTAssertLessThan(distance, 1.0)
    }

    func testNearestWinsBetweenGsuAndGt() {
        // Downtown, closer to GSU than GT.
        let coord = CLLocationCoordinate2D(latitude: 33.7531, longitude: -84.3857)
        guard case let .assigned(campus, _) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .assigned")
        }
        XCTAssertEqual(campus.id, "gsu")
    }

    func testAthensAssignsUga() {
        let coord = CLLocationCoordinate2D(latitude: 33.9480, longitude: -83.3773)
        guard case let .assigned(campus, _) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .assigned")
        }
        XCTAssertEqual(campus.id, "uga")
    }

    func testFarCoordinateIsOutOfRangeWithNearestRetained() {
        // Miami, FL — far from every campus; nearest of the four is UGA.
        let coord = CLLocationCoordinate2D(latitude: 25.7617, longitude: -80.1918)
        guard case let .outOfRange(nearest, distance) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .outOfRange")
        }
        XCTAssertEqual(nearest.id, "uga")
        XCTAssertGreaterThan(distance, CampusLocator.campusMatchRadiusMiles)
    }

    func testAtlantaMetaAnchorIsNeverMatched() {
        // The `atl` meta-anchor must not be a matchable campus.
        XCTAssertFalse(CampusLocator.matchableCampuses.contains { $0.id == "atl" })
        XCTAssertEqual(CampusLocator.matchableCampuses.map(\.id).sorted(), ["gsu", "gt", "ksu", "uga"])
    }

    func testJustOutsideThresholdIsOutOfRange() {
        // ~31 miles due north of UGA stays out of range (KSU/others are farther).
        let coord = CLLocationCoordinate2D(latitude: 33.9480 + 31.0 / 69.0, longitude: -83.3773)
        if case .assigned = CampusLocator.locate(from: coord) {
            XCTFail("expected out of range just beyond 30mi")
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/CampusLocatorTests`
Expected: FAIL — `cannot find 'CampusLocator' in scope`.

- [ ] **Step 3: Write minimal implementation**

```swift
// Dealy/Services/CampusLocator.swift
import CoreLocation
import Foundation

/// Result of matching a device coordinate to a supported campus. Advisory input
/// to ranking/personalization ONLY — never an access gate.
enum CampusAssignment: Equatable {
    /// Within `CampusLocator.campusMatchRadiusMiles` of a campus.
    case assigned(Campus, distanceMiles: Double)
    /// Beyond the threshold; nearest campus retained for honest messaging.
    case outOfRange(nearest: Campus, distanceMiles: Double)
    /// No coordinate (permission denied / no fix).
    case unavailable
}

/// Pure, dependency-free campus matcher. Turns a coordinate into a
/// `CampusAssignment` via haversine distance to the four real campuses.
enum CampusLocator {
    /// Campus-match threshold (miles). Distinct from any campus `defaultRadius`,
    /// which is a deal-search radius, a different concept.
    static let campusMatchRadiusMiles = 30.0

    /// The four real campuses. Excludes the `atl` meta-anchor by design.
    static let matchableCampuses: [Campus] = [
        .georgiaState, .georgiaTech, .kennesaw, .uga,
    ]

    static func locate(from coordinate: CLLocationCoordinate2D?) -> CampusAssignment {
        guard let coordinate else { return .unavailable }

        let ranked = matchableCampuses
            .map { (campus: $0, miles: milesBetween(coordinate, $0)) }
            // Deterministic: nearest first, ties broken by campus id.
            .sorted { $0.miles != $1.miles ? $0.miles < $1.miles : $0.campus.id < $1.campus.id }

        guard let best = ranked.first else { return .unavailable }
        return best.miles <= campusMatchRadiusMiles
            ? .assigned(best.campus, distanceMiles: best.miles)
            : .outOfRange(nearest: best.campus, distanceMiles: best.miles)
    }

    /// Great-circle distance in miles between a coordinate and a campus center.
    private static func milesBetween(_ coordinate: CLLocationCoordinate2D, _ campus: Campus) -> Double {
        let here = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let there = CLLocation(latitude: campus.latitude, longitude: campus.longitude)
        return here.distance(from: there) / 1609.344 // meters → miles
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/CampusLocatorTests`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add Dealy/Services/CampusLocator.swift DealyTests/CampusLocatorTests.swift project.yml
git commit -m "feat: pure CampusLocator with 30mi threshold and 3-state assignment"
```

---

### Task 2: `AppState` campus assignment + manual override

**Files:**
- Modify: `Dealy/Models/PreferencesStore.swift` (add `manualCampusOverride` to `PersistedState`)
- Modify: `Dealy/ViewModels/AppState.swift` (expose `campusAssignment`, add override API)
- Test: `DealyTests/AppStateTests.swift` (append)

**Interfaces:**
- Consumes: `CampusLocator.locate(from:)`, `CampusAssignment` (Task 1).
- Produces:
  - `AppState.campusAssignment: CampusAssignment` — derived from the active discovery center coordinate.
  - `AppState.selectCampusOverride(_ campus: Campus)` — sets `manualCampusOverride = true`, applies that campus center.
  - `AppState.clearCampusOverride()` — sets `manualCampusOverride = false`.
  - `AppState.isCampusOverridden: Bool`.

- [ ] **Step 1: Write the failing tests**

```swift
// Append to DealyTests/AppStateTests.swift
func testCampusAssignmentReflectsDeviceCenterOnCampus() {
    let app = AppState(store: InMemoryPreferencesStore())
    let gt = DiscoveryCenter(latitude: 33.7756, longitude: -84.3963,
                             displayName: "Current location", source: .device)
    app.setDiscovery(.nearby(center: gt, radiusMiles: 5))
    guard case let .assigned(campus, _) = app.campusAssignment else {
        return XCTFail("expected .assigned")
    }
    XCTAssertEqual(campus.id, "gt")
}

func testCampusAssignmentIsUnavailableForLegacyDefaultBeforeLocation() {
    // The shipped default center is a legacy anchor with no real fix; treat as unavailable.
    let app = AppState(store: InMemoryPreferencesStore())
    XCTAssertEqual(app.campusAssignment, .unavailable)
}

func testManualOverrideFlagSetAndCleared() {
    let app = AppState(store: InMemoryPreferencesStore())
    XCTAssertFalse(app.isCampusOverridden)
    app.selectCampusOverride(.uga)
    XCTAssertTrue(app.isCampusOverridden)
    XCTAssertEqual(app.currentCampus.id, "uga")
    app.clearCampusOverride()
    XCTAssertFalse(app.isCampusOverridden)
}
```

> NOTE: If `InMemoryPreferencesStore` does not already exist in the test target, use the store double already used by the other `AppStateTests` cases (check the top of the file) — reuse it rather than introduce a new one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/AppStateTests`
Expected: FAIL — `value of type 'AppState' has no member 'campusAssignment'`.

- [ ] **Step 3a: Add the persisted flag**

In `Dealy/Models/PreferencesStore.swift`, add to `PersistedState` (with a defaulted decode so existing persisted blobs still load):

```swift
var manualCampusOverride: Bool = false
```

Ensure the struct's `init`/decoding defaults it to `false` (if `PersistedState` uses synthesized `Codable`, add `= false` as shown so older payloads missing the key decode cleanly — verify the existing decode strategy in the file and match it).

- [ ] **Step 3b: Expose assignment + override API in `AppState`**

Add to `AppState`:

```swift
/// Advisory campus match for the active discovery center. NEVER gates deals.
/// A center that is not a real device fix yields `.unavailable`.
@MainActor
var campusAssignment: CampusAssignment {
    guard discovery.center.source == .device else { return .unavailable }
    return CampusLocator.locate(from: CLLocationCoordinate2D(
        latitude: discovery.center.latitude,
        longitude: discovery.center.longitude
    ))
}

var isCampusOverridden: Bool { persisted.manualCampusOverride }

/// Demoted correction: pin a campus and stop auto-detect from stomping it.
func selectCampusOverride(_ campus: Campus) {
    persisted.manualCampusOverride = true
    selectCampus(campus)            // existing helper: sets .legacyCampus center
}

/// Resume automatic detection.
func clearCampusOverride() {
    persisted.manualCampusOverride = false
    persist()
}
```

Add `import CoreLocation` at the top of `AppState.swift` if not present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/AppStateTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/ViewModels/AppState.swift Dealy/Models/PreferencesStore.swift DealyTests/AppStateTests.swift
git commit -m "feat: expose campusAssignment and manual override on AppState"
```

---

### Task 3: Foreground re-detection

**Files:**
- Modify: `Dealy/ViewModels/AppState.swift` (add `refreshCampusOnForeground()`)
- Modify: `Dealy/App/RootView.swift` (call it on `scenePhase → .active`)
- Test: `DealyTests/AppStateTests.swift` (append)

**Interfaces:**
- Consumes: existing `enableNearbyOrFallbackToAnywhere()` / `refreshFromDeviceLocation()`, `isCampusOverridden` (Task 2).
- Produces: `AppState.refreshCampusOnForeground() async` — re-resolves device location and applies it, UNLESS a manual override is active.

- [ ] **Step 1: Write the failing test**

```swift
// Append to DealyTests/AppStateTests.swift
func testForegroundRefreshSkippedWhenOverridden() async {
    // Override pins UGA; a foreground refresh must not replace it even if the
    // location provider would return a different (Atlanta) fix.
    let provider = MockLocationProvider(
        authorization: .authorizedWhenInUse,
        result: .success(DiscoveryCenter(latitude: 33.7531, longitude: -84.3857,
                                         displayName: "Current location", source: .device))
    )
    let app = AppState(store: InMemoryPreferencesStore(), locationProvider: provider)
    app.selectCampusOverride(.uga)
    await app.refreshCampusOnForeground()
    XCTAssertEqual(app.currentCampus.id, "uga")
}

func testForegroundRefreshAppliesDeviceLocationWhenNotOverridden() async {
    let provider = MockLocationProvider(
        authorization: .authorizedWhenInUse,
        result: .success(DiscoveryCenter(latitude: 33.7756, longitude: -84.3963,
                                         displayName: "Current location", source: .device))
    )
    let app = AppState(store: InMemoryPreferencesStore(), locationProvider: provider)
    await app.refreshCampusOnForeground()
    guard case let .assigned(campus, _) = app.campusAssignment else {
        return XCTFail("expected .assigned")
    }
    XCTAssertEqual(campus.id, "gt")
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/AppStateTests`
Expected: FAIL — no member `refreshCampusOnForeground`.

- [ ] **Step 3a: Implement in `AppState`**

```swift
/// Re-detect campus from a fresh device fix on app activation. No-op while a
/// manual override is active so we never stomp a user's correction. Failures
/// fall back honestly (online-only) without blocking, matching onboarding.
@MainActor
func refreshCampusOnForeground() async {
    guard !isCampusOverridden else { return }
    _ = await enableNearbyOrFallbackToAnywhere()
}
```

- [ ] **Step 3b: Wire into `RootView`**

In `Dealy/App/RootView.swift`, add (inside the root view that owns `app`):

```swift
@Environment(\.scenePhase) private var scenePhase
```

and attach to the main content view:

```swift
.onChange(of: scenePhase) { _, phase in
    guard phase == .active, app.hasCompletedOnboarding else { return }
    Task { await app.refreshCampusOnForeground() }
}
```

> NOTE: Read `RootView.swift` first and attach `.onChange` to the existing top-level container; do not introduce a new wrapper view.

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/AppStateTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/ViewModels/AppState.swift Dealy/App/RootView.swift DealyTests/AppStateTests.swift
git commit -m "feat: re-detect campus on foreground, skip when overridden"
```

---

### Task 4: `InventoryClass` + four-class blend + never-gate contract test

**Files:**
- Create: `Dealy/Services/InventoryClass.swift`
- Test: `DealyTests/FeedBlendContractTests.swift`

**Interfaces:**
- Consumes: `Deal` (`isOnline`, `isStudentOnly`, `isTrending` from Task 5 — but Task 4 defines the enum using only `isOnline`/`isStudentOnly`; `trending` is added in Task 5), `DealRanker.rank(...)`, `CampusAssignment`.
- Produces:
  - `enum InventoryClass: String, CaseIterable { case local, online, national, trending }`
  - `static func InventoryClassifier.classify(_ deal: Deal) -> InventoryClass`
  - The contract: ranking/blend never removes non-local deals across campus states.

- [ ] **Step 1: Write the failing tests**

```swift
// DealyTests/FeedBlendContractTests.swift
import XCTest
@testable import Dealy

final class FeedBlendContractTests: XCTestCase {

    // Build a small mixed catalog: one local, one online, one online+student.
    private func catalog() -> [Deal] { Array(MockDeals.all.prefix(12)) }

    func testCampusStateNeverRemovesNonLocalDeals() {
        let deals = catalog()
        let online = Set(deals.filter { $0.isOnline }.map(\.id))
        XCTAssertFalse(online.isEmpty, "fixture must contain online deals")

        // Rank as an assigned GSU student and as an out-of-range / no-campus user.
        let assigned = DealRanker.rank(deals, interests: [], campus: .georgiaState, radius: 10)
        let noCampus = DealRanker.rank(deals, interests: [], campus: .atlanta, radius: 10)

        // The SET of deals is identical regardless of campus — only order may differ.
        XCTAssertEqual(Set(assigned.map(\.id)), Set(deals.map(\.id)))
        XCTAssertEqual(Set(noCampus.map(\.id)), Set(deals.map(\.id)))
        // Every online deal survives in both rankings.
        XCTAssertTrue(online.isSubset(of: Set(assigned.map(\.id))))
        XCTAssertTrue(online.isSubset(of: Set(noCampus.map(\.id))))
    }

    func testClassifierAssignsOnlineAndLocal() {
        let onlineDeal = MockDeals.all.first { $0.isOnline }!
        let localDeal = MockDeals.all.first { !$0.isOnline }!
        XCTAssertEqual(InventoryClassifier.classify(onlineDeal), .online)
        XCTAssertEqual(InventoryClassifier.classify(localDeal), .local)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/FeedBlendContractTests`
Expected: FAIL — `cannot find 'InventoryClassifier' in scope`.

- [ ] **Step 3: Implement the classifier**

```swift
// Dealy/Services/InventoryClass.swift
import Foundation

/// The four inventory classes that compose the Dealy feed. Campus assignment
/// changes only the weighting/presence of `.local`; `.online`, `.national`, and
/// `.trending` are always available to every user regardless of campus state.
enum InventoryClass: String, CaseIterable {
    case local
    case online
    case national
    case trending
}

enum InventoryClassifier {
    /// Classify a deal into its inventory class. `.trending` takes precedence
    /// (a high-value cross-campus promotion is surfaced everywhere); otherwise
    /// online student-eligible deals are `.national`, other online deals are
    /// `.online`, and the rest are `.local`.
    static func classify(_ deal: Deal) -> InventoryClass {
        if deal.isTrending { return .trending }
        if deal.isOnline { return deal.isStudentOnly ? .national : .online }
        return .local
    }
}
```

> NOTE: `deal.isTrending` is introduced in Task 5. If Task 5 is not yet done, temporarily treat trending as `false` by omitting the first line; Task 5 re-adds it and updates this file. (Prefer doing Task 5 first if executing out of order.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/FeedBlendContractTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Services/InventoryClass.swift DealyTests/FeedBlendContractTests.swift project.yml
git commit -m "feat: InventoryClass blend + never-gate contract test"
```

---

### Task 5: First-class `TrendingCampusDeals` slot

**Files:**
- Modify: `Dealy/Models/Deal.swift` (add `isTrending` with default `false`)
- Modify: the Deal DTO mapping (find via `grep -rn "isStudentOnly" Dealy/Services` — same file maps server flags to `Deal`)
- Test: `DealyTests/FeedBlendContractTests.swift` (append) + `DealyTests/DealDTOMappingTests.swift` (append)

**Interfaces:**
- Consumes: existing `Deal` initializer and DTO mapping.
- Produces: `Deal.isTrending: Bool` (defaults `false`); DTO reads optional server key `trending`/`isTrending` defaulting to `false`. `InventoryClassifier.classify` returns `.trending` for trending deals (already coded in Task 4).

- [ ] **Step 1: Write the failing tests**

```swift
// Append to DealyTests/FeedBlendContractTests.swift
func testTrendingDealClassifiesAsTrendingRegardlessOfOnline() {
    let base = MockDeals.all.first!
    let trending = base.withTrending(true)   // test helper below
    XCTAssertEqual(InventoryClassifier.classify(trending), .trending)
}
```

If `Deal` is immutable with a memberwise init, add a tiny test-only helper in the test file:

```swift
private extension Deal {
    func withTrending(_ value: Bool) -> Deal {
        var copy = self
        copy.isTrending = value
        return copy
    }
}
```

(Only works if `isTrending` is a `var`. Define it as `var isTrending: Bool` on `Deal`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/FeedBlendContractTests`
Expected: FAIL — `value of type 'Deal' has no member 'isTrending'`.

- [ ] **Step 3a: Add the field to `Deal`**

In `Dealy/Models/Deal.swift`, add a stored property (default `false` so all existing constructors and `MockDeals` keep compiling) near `isStudentOnly`:

```swift
var isTrending: Bool = false
```

If `Deal` uses an explicit memberwise `init`, add `isTrending: Bool = false` as a defaulted trailing parameter and assign it; do NOT reorder existing parameters.

- [ ] **Step 3b: Map it in the DTO**

In the DTO mapping file (the one that sets `isStudentOnly` from the server payload), read an optional flag defaulting to `false`:

```swift
isTrending: dto.isTrending ?? false
```

and add `let isTrending: Bool?` to the DTO struct's decoded fields. This is a slot for backend-supplied trending — it fabricates nothing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/FeedBlendContractTests -only-testing:DealyTests/DealDTOMappingTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Models/Deal.swift Dealy/Services DealyTests/FeedBlendContractTests.swift DealyTests/DealDTOMappingTests.swift
git commit -m "feat: first-class TrendingCampusDeals slot on Deal + DTO"
```

---

### Task 6: Dollars-saved analytics on redemption

**Files:**
- Modify: `Dealy/ViewModels/AppState.swift` (`DealInteractionEvent.markedUsed` carries savings + campus + class)
- Modify: `Dealy/Services/API/RemoteInteractionRecorder.swift` (route body includes savings/campus/class)
- Test: `DealyTests/InteractionRecorderTests.swift` (append)

**Interfaces:**
- Consumes: `InventoryClassifier.classify` (Task 4), `CampusAssignment`/`AppState.campusAssignment` (Task 2), existing `markUsed(_ deal:)`.
- Produces: `DealInteractionEvent.markedUsed(dealID: String, savingsAmount: Decimal, campusID: String?, inventoryClass: String)` and a redemption payload carrying those fields.

> RATIONALE: The KPI is **total dollars saved**. The redemption event is the realized-savings boundary (`markUsed`), so it must carry the dollar amount plus campus + inventory-class context for later aggregation.

- [ ] **Step 1: Write the failing test**

```swift
// Append to DealyTests/InteractionRecorderTests.swift
func testRedemptionBodyCarriesDollarsSavedAndContext() {
    let route = RemoteInteractionRecorder.route(for: .markedUsed(
        dealID: "d1", savingsAmount: 199.00, campusID: "gt", inventoryClass: "national"))
    XCTAssertEqual(route.path, "/v1/deals/d1/redemptions")
    XCTAssertEqual(route.body["savings_amount"] as? String, "199")
    XCTAssertEqual(route.body["campus_id"] as? String, "gt")
    XCTAssertEqual(route.body["inventory_class"] as? String, "national")
    // Still no precise coordinates.
    XCTAssertNil(route.body["latitude"])
    XCTAssertNil(route.body["longitude"])
}
```

> NOTE: `savings_amount` is serialized as a string to preserve `Decimal` precision (`String(describing:)`). Match whatever numeric encoding the file already uses for money if one exists; otherwise use the string form asserted here.

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/InteractionRecorderTests`
Expected: FAIL — `markedUsed` has no `savingsAmount` parameter.

- [ ] **Step 3a: Extend the event**

In `Dealy/ViewModels/AppState.swift`, change the enum case:

```swift
case markedUsed(dealID: String, savingsAmount: Decimal, campusID: String?, inventoryClass: String)
```

Update `markUsed(_ deal:)` to emit it with context:

```swift
@discardableResult
func markUsed(_ deal: Deal) -> Bool {
    guard !persisted.savingsEvents.contains(where: { $0.dealID == deal.id }) else { return false }
    guard deal.savingsAmount > 0 else { return false }
    let event = SavingsEvent(dealID: deal.id, dealTitle: deal.title, amount: deal.savingsAmount)
    persisted.savingsEvents.append(event)
    persist()
    let campusID: String? = {
        if case let .assigned(campus, _) = campusAssignment { return campus.id }
        return nil
    }()
    interactionRecorder.record(.markedUsed(
        dealID: deal.id,
        savingsAmount: deal.savingsAmount,
        campusID: campusID,
        inventoryClass: InventoryClassifier.classify(deal).rawValue
    ))
    return true
}
```

> Mark `markUsed` `@MainActor` if `campusAssignment` (MainActor) forces it; the only caller is UI, so this is safe. Verify call sites still compile.

- [ ] **Step 3b: Update the recorder route**

In `RemoteInteractionRecorder.swift`, update the `markedUsed` route to include the new fields in `body`:

```swift
case let .markedUsed(dealID, savingsAmount, campusID, inventoryClass):
    var body: [String: Any] = [
        "savings_amount": String(describing: savingsAmount),
        "inventory_class": inventoryClass,
    ]
    if let campusID { body["campus_id"] = campusID }
    return Route(path: "/v1/deals/\(dealID)/redemptions", body: body)
```

> Match the existing `Route` construction style in the file exactly (struct name, field names).

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:DealyTests/InteractionRecorderTests`
Expected: PASS. Also run the full suite (next step in verification) to catch any `markedUsed` call sites.

- [ ] **Step 5: Commit**

```bash
git add Dealy/ViewModels/AppState.swift Dealy/Services/API/RemoteInteractionRecorder.swift DealyTests/InteractionRecorderTests.swift
git commit -m "feat: dollars-saved KPI on redemption event (amount + campus + class)"
```

---

### Task 7: Demote the manual picker + full-suite verification

**Files:**
- Modify: `Dealy/Views/Location/LocationSelectorView.swift` (Apply sets override; add "Use my location" reset)
- Modify: any onboarding reference (verify no campus prompt exists — `OnboardingFlow` already auto-prepares; confirm)

**Interfaces:**
- Consumes: `AppState.selectCampusOverride(_:)`, `AppState.clearCampusOverride()` (Task 2).

- [ ] **Step 1: Reframe the selector's Apply**

When the user applies a Nearby campus choice manually, route through the override so foreground re-detect won't stomp it. In `LocationSelectorView`'s Apply action, when the chosen center is a legacy/campus pick (not a fresh device fix), call `app.selectCampusOverride(<campus>)`; when the user taps "Use my location" / a device fix is applied, call `app.clearCampusOverride()` then the existing device-location path.

> NOTE: Read the current Apply handler first. Keep its atomic `applyDiscovery` behavior; only add the override flag toggle alongside it. The exact wiring depends on how the draft maps to a `Campus` — if the selector edits raw centers, add a campus resolution via `Campus.all.first { ... }` or pass through `clearCampusOverride()` for device fixes and `selectCampusOverride` only when a discrete campus is chosen.

- [ ] **Step 2: Confirm onboarding never prompts for a campus**

Read `Dealy/Views/Onboarding/OnboardingFlow.swift`. Confirm there are exactly two steps (`welcome`, `interests`) and that discovery is prepared via `prepareDiscoveryForOnboarding()` with no campus selection UI. If a campus step exists anywhere, remove it. (As of this plan it does not — this step is a verification gate.)

- [ ] **Step 3: Run the FULL test suite**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: PASS — all tests green, including pre-existing suites. Fix any `markedUsed`/`isTrending` compile breaks surfaced here.

- [ ] **Step 4: Commit**

```bash
git add Dealy/Views/Location/LocationSelectorView.swift
git commit -m "feat: demote manual picker to Settings correction with override"
```

---

## Self-Review

**Spec coverage:**
- "No manual school selection in onboarding" → Task 7 Step 2 (verification) + onboarding already compliant.
- "Auto-assign from GPS, 30mi threshold, 3 states, exclude atlanta" → Task 1.
- "Foreground re-detect" → Task 3.
- "Manual override escape hatch in Settings" → Tasks 2 + 7.
- "Campus assignment never gates access" → Task 4 contract test (+ DealRanker already additive).
- "Four-class blend (Local/Online/Trending/National)" → Task 4 `InventoryClass` + classifier.
- "First-class TrendingCampusDeals" → Tasks 4 + 5.
- "Dollars-saved analytics KPI" → Task 6.
- Out-of-scope items (online catalog, MapKit redemption finder, real trending ingestion, dashboards, MockDeals purge) → not implemented, as specified.

**Placeholder scan:** No TBD/TODO; every code step shows real code. Two `NOTE` blocks point the implementer at existing patterns to match (store double, Route style, Apply handler) rather than leaving logic unspecified — acceptable, since the behavior and signatures are fully defined.

**Type consistency:** `CampusAssignment`, `CampusLocator.locate`, `InventoryClass`/`InventoryClassifier.classify`, `Deal.isTrending`, and `markedUsed(dealID:savingsAmount:campusID:inventoryClass:)` are used identically across tasks. Task 4 notes the ordering dependency with Task 5's `isTrending` and resolves it.

**Known ordering note:** Task 4's classifier references `deal.isTrending` (Task 5). Execute Task 5's `Deal.isTrending` field addition before or together with Task 4's classifier to avoid a transient compile break, or follow Task 4's inline NOTE.
