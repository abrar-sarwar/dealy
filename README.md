# Dealy — iOS Frontend MVP

**Swipe. Save. Repeat.** Dealy is a swipe-first, location-aware savings app — a
"Tinder/TikTok for deals." This repository is the **frontend MVP**: a polished,
compile-ready SwiftUI app backed entirely by local mock data. There is no real
backend, networking, or third-party SDK.

The MVP is themed around Atlanta and four Georgia campuses: Georgia State,
Georgia Tech, Kennesaw State, and the University of Georgia (plus metro Atlanta).

---

## What's inside

- **Branded startup** transition (respects Reduce Motion) over a static launch screen.
- **Onboarding**: 3 intro pages → campus/city + radius → interests → confirmation.
- **Home swipe deck** (the hero): draggable cards with rotation, SAVE/SKIP stamps,
  velocity-aware completion, haptics, button-driven save/skip on the same path,
  **Undo**, category filters, ShareLink, watch, and rich empty states.
- **Deal Detail** sheet: hero artwork, price/savings, explainable Deal Score,
  "why this is a good deal," terms, map placeholder, save/watch/share,
  "Get Deal" preview, and a no-double-count **Mark as used**.
- **Explore**: native `searchable`, category shortcuts, and curated carousels
  (Trending, Food near campus, Tech, Groceries, Entertainment, Recently added,
  Ending soon).
- **Saved**: potential-vs-realized savings summary, category filter, swipe to
  remove / watch, empty state that routes back to Home.
- **Location selector**: campus cards + 1–25 mi radius slider (applies on Done,
  never destroys saved deals).
- **Dealy+**: tasteful subscription **preview** (Student $2.99 / Regular $5.99),
  no StoreKit, no dark patterns.
- **Profile/Settings**: stats, interests, location, notification preferences,
  help/about, and debug resets (onboarding, deal history, restore dataset).

## Requirements

- macOS with **Xcode 15+** (iOS 17 SDK).
- **XcodeGen** to generate the project from `project.yml`.
- An installed iOS 17+ iPhone Simulator runtime.

## Generate, open, build, run

```bash
# 1. Install XcodeGen if needed
brew install xcodegen

# 2. Generate the Xcode project
xcodegen generate

# 3. Open in Xcode
open Dealy.xcodeproj
#    Select an iPhone simulator and press ⌘R.
```

### Build from the command line

Pick an installed simulator dynamically, then build:

```bash
# List available iPhone simulators
xcrun simctl list devices available | grep iPhone

# Build (replace the name with one that is installed)
xcodebuild \
  -project Dealy.xcodeproj \
  -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -derivedDataPath .derivedData \
  build
```

### Run the tests

```bash
xcodebuild \
  -project Dealy.xcodeproj \
  -scheme Dealy \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -derivedDataPath .derivedData \
  test
```

## Architecture

MVVM with small, focused files and reusable components.

```
Dealy/
  App/            DealyApp, RootView (startup→onboarding→main), MainTabView
  Models/         Deal, DealCategory, Campus, SwipeAction, SavingsEvent
  ViewModels/     AppState (composition root), HomeFeedViewModel, ExploreSections, TabRouter
  Views/          Startup, Onboarding, Home, Explore, Saved, Location, DealyPlus, Profile, Shared
  Components/     Cards, chips, badges, artwork, layout, savings summary
  Services/       DealServicing + MockDealService, DealFilter, DealRanker,
                  PreferencesStore, placeholder integration protocols
  Data/           MockDeals (37 deterministic deals)
  DesignSystem/   Theme tokens, button/card styles, color helpers
  Utilities/      Formatters, Haptics
  Resources/      Info.plist, brand mark, source artwork
  Assets.xcassets AppIcon, DealyMark, accent/launch colors
DealyTests/       Model, filter/ranker, AppState, persistence tests
```

- **`AppState`** (`@Observable`) is the single composition root. It owns the
  catalog and all persisted user state, and is the **only** place that mutates
  saved/watched/history/savings — keyed by deal `id`, never duplicated into
  `Deal` values. Injected via `.environment`.
- **Pure logic** (`DealFilter`, `DealRanker`, money math) is separated from
  views so it's unit-tested without UI.

## Mock data & local persistence

- **Mock data**: `MockDeals.dataset(reference:)` produces 37 deterministic deals
  across all categories and locations, with expirations relative to a reference
  date (so previews/tests stay reproducible). Served through the async
  `DealServicing` protocol via `MockDealService`, which also supports a
  debug-only simulated-failure path to exercise the error state.
- **Persistence**: all user-facing state is one `Codable` `PersistedState` value
  saved through `PreferenceStoring` (UserDefaults + JSON by default; in-memory
  for tests). The single storage key lives only in the store — no raw keys in
  views.
- **Deal Score / personalization** is deterministic, explainable, frontend-only
  ranking (interest match, proximity, discount, urgency). It is **not** AI and
  is designed to be replaced by a backend recommender.

## Future backend integration points

Small protocols mark where real services plug in (with focused `TODO`s):

- `DealServicing` → replace `MockDealService` with a Supabase-backed service.
- `PreferenceStoring` → backend-synced preference store.
- `LocationProviding` → CoreLocation provider (the MVP uses explicit campus
  choice instead of location permission, by design).
- `RedemptionHandling` → affiliate/coupon/map link handling ("Get Deal").
- `NotificationScheduling` → push/local deal alerts.

## Intentional scope deviations

- **No CoreLocation permission**: the MVP uses an explicit campus/city + radius
  to drive "nearby" mock results, as specified.
- **No StoreKit/payments**: Dealy+ is a non-functional preview; core features
  are never paywalled.
- **App icon**: the supplied artwork had pre-rendered rounded corners with black
  corner regions. Those were removed to produce a clean, full-bleed 1024×1024
  icon (Apple applies its own mask). The original is preserved at
  `Dealy/Resources/Dealy-source.png`.
- All offers are fictional mock data and are not real-world promotions.
```
