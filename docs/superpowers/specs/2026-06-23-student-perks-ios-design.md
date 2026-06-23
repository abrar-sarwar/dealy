# Student Perks — iOS (3b) Design

**Date:** June 23, 2026
**Status:** Approved for implementation planning
**Scope:** iOS only. A browsable "Student Perks" section (in Explore) backed by the curated `/v1/feeds/student` endpoint, plus a deal-detail "Get Deal Online / Find Nearby Stores" experience where Find Nearby uses MapKit `MKLocalSearch` to locate physical redemption stores. Consumes the 3a backend contract; no backend changes.

## Product goal

Deliver the online student programs (Apple Education, Spotify Student, GitHub
Student Pack, …) inside the app and bridge online discounts to physical
redemption — the "I saw a MacBook student deal, show me the nearest Apple Store"
flow. These programs are curated (3a), so they render as `curated`, never with a
Verified badge.

Carried rules: REAL DATA ONLY (no fabricated stores/hours), and online/national
student inventory is always available regardless of campus/location.

## Scope boundary

**3b delivers:** the `redemptionBrand` field on the iOS model, a `.student` feed
fetch, the Explore "Student Perks" section + "See all" list, the detail-view
"Get Deal Online / Find Nearby Stores" actions, and a testable MapKit nearby-store
finder with a map+list results sheet.

**3b does NOT deliver:** any backend change (done in 3a), student eligibility
verification, store opening-hours (MapKit doesn't reliably provide them — we hand
off to Apple Maps for hours), or the blended-into-deck behavior (already handled
by 3a's nearby backfill feeding the existing deck).

## Architecture

Units, each independently testable:

### 1. Data plumbing
- `Deal` (`Dealy/Models/Deal.swift`) gains `var redemptionBrand: String? = nil`
  (defaulted so existing constructors/MockDeals keep compiling).
- `DealDTO` (`Dealy/Services/API/DealDTO.swift`) gains `let redemptionBrand: String?`
  and passes it through `toDeal()`. Optional → tolerates older payloads.

### 2. Student feed fetch
- `DealFeedRequest` (`Dealy/Services/DealServicing.swift`) gains `case student`.
- `RemoteDealService` routes `.student` → `GET /v1/feeds/student?limit=50`,
  mapping `DealPageDTO` → `DealPage` (same pattern as the online feed). It does
  NOT filter out online deals (unlike nearby) — student programs are online.
- `MockDealService` handles `.student` by returning the student-only subset of its
  dataset (the offline/preview double; clearly not shipped inventory). The
  compiler enforces both switches are updated (no `default`).

### 3. AppState student inventory
- `AppState` gains `private(set) var studentDeals: [Deal] = []` and
  `@MainActor func loadStudentDeals() async` that calls
  `dealService.fetchDeals(for: .student)`, stores `studentDeals`, and merges them
  into `dealsByID` so `deal(id:)`, save/watch, and detail lookups resolve them.
  Kept separate from `allDeals` so the section loads independently of the deck.
  Failures leave `studentDeals` empty (the section shows an empty state); they
  never block the app.

### 4. NearbyStoresService (the MapKit unit)
A protocol-abstracted finder so tests never touch real MapKit:
```swift
struct NearbyStore: Identifiable, Equatable {
    let id: String            // stable: name + "\(lat),\(lng)"
    let name: String
    let address: String
    let distanceMiles: Double
    let phone: String?
    let url: URL?
    let latitude: Double
    let longitude: Double
}

protocol NearbyStoreSearching {
    func search(brand: String, near coordinate: CLLocationCoordinate2D) async throws -> [NearbyStore]
}

final class MapKitNearbyStoresService: NearbyStoreSearching { /* MKLocalSearch */ }
struct MockNearbyStoresService: NearbyStoreSearching { /* canned, for tests/previews */ }
```
- `MapKitNearbyStoresService` builds an `MKLocalSearch.Request` (naturalLanguageQuery
  = brand, region ≈ 0.1° span around the user), maps each `MKMapItem` → `NearbyStore`,
  and returns them sorted nearest-first.
- The `MKMapItem`→`NearbyStore` field mapping + distance sort is factored into a
  **pure function** `NearbyStore.from(name:placemark-ish fields:origin:)` and a
  `sortedByDistance(_:)` helper that are unit-tested with plain inputs. The live
  `MKLocalSearch.start()` call is the only untested shell.
- Injected into `AppState` like `redemptionHandler`
  (`nearbyStores: NearbyStoreSearching = MockNearbyStoresService()`), with the
  MapKit impl wired in the production composition root.

### 5. Student Perks UI (Explore)
- `StudentPerksSection` (new view) inside `ExploreView`: a `SectionHeader("Student Perks",
  symbol: "graduationcap.fill")`, a `LazyVStack` of `DealRowCard`s from
  `app.studentDeals`, and a "See all" row → `StudentPerksListView`.
- `StudentPerksListView` (new view): full vertical list of `DealRowCard`s inside the
  Explore `NavigationStack`; `EmptyStateView` when `studentDeals` is empty.
- Tapping a card presents the existing `DealDetailView` sheet.
- `ExploreView` triggers `app.loadStudentDeals()` in a `.task`.
- All visuals reuse Theme/Spacing/DealyCard/DealRowCard/SectionHeader/EmptyStateView.

### 6. Detail actions + Nearby sheet
In `DealDetailView`'s action area:
- **"Get Deal Online"** — when `deal.destinationURL != nil`, opens it (the official
  program page) and records `redemptionClicked`. Reuses the existing Get-Deal path.
- **"Find Nearby Stores"** — shown only when `deal.redemptionBrand != nil`. Presents
  `NearbyStoresSheet(brand:origin:)`.
- `NearbyStoresSheet` (new view): a `Map` header with a pin per store + a list below;
  each row shows name, distance, address and **Call / Website / Directions** buttons.
  Directions opens Apple Maps (`MKMapItem.openInMaps`) which carries hours. Loading,
  empty (`EmptyStateView` "No \(brand) stores nearby"), and error states are explicit.
- Origin coordinate comes from `app.discovery.center` when it's a real device fix;
  otherwise the sheet requests a one-shot `app.resolveDeviceCenter()` and shows a
  "enable location to find stores" empty state on failure.

## Data flow

```
ExploreView .task → AppState.loadStudentDeals()
   → dealService.fetchDeals(.student) → GET /v1/feeds/student → [Deal] (curated, redemptionBrand?)
   → studentDeals + merged into dealsByID
StudentPerksSection / StudentPerksListView render DealRowCards → DealDetailView sheet
DealDetailView:
   "Get Deal Online"   → open destinationURL
   "Find Nearby Stores"→ NearbyStoresSheet(brand: deal.redemptionBrand!, origin)
        → nearbyStores.search(brand, near: origin) → [NearbyStore] (nearest-first)
        → Map pins + list (Call / Website / Directions→Apple Maps)
```

## Error handling

- Student feed failure → `studentDeals` stays empty; section renders `EmptyStateView`,
  app unaffected.
- No location for the nearby finder → sheet shows an "enable location" empty state
  (never a crash, never fabricated coordinates).
- `MKLocalSearch` failure/zero results → "No \(brand) stores nearby" empty state.
- A deal with no `destinationURL` simply doesn't show "Get Deal Online"; a deal with
  no `redemptionBrand` doesn't show "Find Nearby Stores".

## Testing

- `DealDTO` decodes `redemptionBrand` (string and null/absent).
- `RemoteDealService` routes `.student` → `/v1/feeds/student` and maps items
  (StubURLProtocol, mirroring the existing online/nearby tests); does not drop
  online deals.
- `MockDealService` `.student` returns only student-only deals.
- `AppState.loadStudentDeals()` populates `studentDeals` and makes them resolvable
  via `deal(id:)`; a failing service leaves `studentDeals` empty.
- `NearbyStoresService`: the pure `MKMapItem`-fields → `NearbyStore` mapping and
  `sortedByDistance` ordering (nearest-first); `MockNearbyStoresService` drives a
  view-model-level test for loaded/empty results.

## Out of scope (explicit)

- Backend changes (3a).
- Student eligibility verification (SheerID etc.).
- Store opening hours (hand off to Apple Maps).
- A dedicated Student Perks tab (chosen: section in Explore).
- Blended-into-deck behavior (already delivered by 3a's nearby backfill).
