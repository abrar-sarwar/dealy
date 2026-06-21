# Dealy — iOS Frontend MVP

**Swipe. Save. Repeat.** Dealy is a swipe-first, location-aware savings app — a
"Tinder/TikTok for deals." This repository is a polished, compile-ready SwiftUI
app that runs on local mock data by default and can talk to the Dealy API when
`DEALY_API_ENV` is set. Discovery uses the **device's current location only**
(Apple Core Location, When-In-Use) — no paid third-party location API, no
background location, and **no manual city/ZIP entry**.

The app is themed around Atlanta and Georgia campuses. The backend implements a
density-first Atlanta verified-inventory pilot (food, groceries, local events):
Nearby serves a zone only once it holds ≥20 deals recently confirmed against a
real authoritative source. Whether any zone is actually live depends on connected
authoritative providers (see `backend/docs/providers.md`) — curated/fixture
inventory never qualifies a zone.

---

## Device-location-only discovery

- **Permission:** only **When-In-Use** Core Location is requested during
  onboarding. If location is unavailable (denied/restricted/failed), the app is
  never blocked — the user drops into **Anywhere** (online-only) and can enable
  Nearby later via a calm "Enable Nearby deals" action (→ Settings when denied).
- **Search owns location.** One shared `DiscoveryPreference` (mode, center,
  radius) drives Home, Map, and Explore; changing it refreshes Home immediately
  and never affects saved deals or swipe history. Precise coordinates are never
  shown in the UI or sent to analytics.
- **Radius:** 1–100 miles (default 10). Changing it immediately refreshes Home.
- **Nearby vs Anywhere:** Nearby returns only **active, source-verified, physical**
  deals within the radius, ranked by distance + freshness — online deals are never
  blended in. Anywhere returns verified online-only inventory and needs no
  location. API routes: `GET /v1/feeds/nearby` (`lat`/`lng`/`radiusMiles`) and
  `GET /v1/feeds/online`. The **Verified** badge means Dealy recently confirmed
  the deal with its authoritative source.
- **Map:** the full interactive deal map is a Dealy+ feature; the free entry is a
  non-interactive preview.

## What's inside

- **Branded startup** transition (respects Reduce Motion) over a static launch screen.
- **Onboarding**: 3 intro pages → enable current location (or choose Anywhere) + 1–100 mi radius → interests → confirmation.
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
- **Location selector** (Search-owned): use current location (device only), Nearby
  vs Anywhere, and a 1–100 mi radius slider (applies on Apply, never destroys saved
  deals). When location is denied, an Open Settings affordance is offered.
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

### Run against a local API

By default the app uses mock data. Set `DEALY_API_ENV` to point at a backend
(`local` → `http://localhost:3000`, `staging`, or `production`). In Xcode, add it
under **Product → Scheme → Edit Scheme… → Run → Arguments → Environment
Variables**, then run the backend (`cd backend && pnpm db:up && pnpm start:dev`).
When `DEALY_API_ENV` is unset, `MockDealService` powers previews and offline dev.

### Testing location in the simulator

Core Location needs a simulated position: **Simulator → Features → Location →
Custom Location…** (or pick a city). On a fresh install, **Allow** the
When-In-Use prompt and the center becomes the simulated location for Nearby;
**Deny** it and the app drops into Anywhere (online-only), with an "Enable Nearby
deals" action to switch back once permission is granted.

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

- `DealServicing` → `RemoteDealService` (live) or `MockDealService` (default),
  selected by `DEALY_API_ENV`.
- `LocationProviding` → `CoreLocationProvider` (When-In-Use, implemented).
  Nearby is device-location-only — there is no manual city/ZIP entry.
- `PreferenceStoring` → backend-synced preference store (future).
- `DealInteractionRecording` → records explicit interaction signals (impression,
  opened, swiped, redemption-clicked, marked-used). The live app injects
  `RemoteInteractionRecorder` (best-effort POSTs to `/v1/deals/:id/...`, no
  precise coordinates); previews/offline/tests use the no-op recorder.
- `RedemptionHandling` → affiliate/coupon/map link handling ("Get Deal").
- `NotificationScheduling` → push/local deal alerts.

## Intentional scope deviations

- **Location**: device location only via Apple Core Location (When-In-Use) — no
  paid location API, no background location, and no manual city/ZIP entry. When
  permission is unavailable the app falls back to Anywhere (online-only).
- **No StoreKit/payments**: Dealy+ is a non-functional preview; core features
  are never paywalled.
- **App icon**: the supplied artwork had pre-rendered rounded corners with black
  corner regions. Those were removed to produce a clean, full-bleed 1024×1024
  icon (Apple applies its own mask). The original is preserved at
  `Dealy/Resources/Dealy-source.png`.
- All offers are fictional mock data and are not real-world promotions.
```
