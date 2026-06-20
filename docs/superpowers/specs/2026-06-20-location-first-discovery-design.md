# Dealy Location-First Discovery Design

**Date:** June 20, 2026  
**Status:** Approved for implementation planning  
**Initial implementation scope:** Location foundation and real nearby inventory

## Product goal

Make Dealy useful outside Atlanta by anchoring discovery to the user's current or
selected location. The Home tab remains a Tinder-style swipe deck. Search/Explore
owns location selection, radius controls, and the Dealy+ map experience.

The first implementation must:

1. Resolve a usable search location from device location or a city/ZIP fallback.
2. Let the user choose a radius from 1–100 miles.
3. Support an `Anywhere` mode that returns online deals only.
4. Apply location changes immediately to Search and the Home swipe deck.
5. Fetch real nearby inventory from Dealy's backend using coordinates and radius.
6. Record the interaction signals needed for later personalization and Ask Dealy.

Marketplace submissions, seller reputation, sponsored placement, the complete
Dealy+ map, and the Ask Dealy LLM are follow-on projects, not part of this build.

## API requirements

No paid third-party location API or API key is required for the foundation:

- Apple Core Location supplies the device's coordinates after permission.
- Apple platform geocoding resolves a user-entered city or ZIP code.
- MapKit renders maps when the Dealy+ map is implemented.
- Dealy's own backend API receives coordinates and returns matching deals.

Provider APIs are required to populate the catalog with real deals, but they are
separate from locating the user. The backend already has a provider ingestion
pipeline and an indexed PostGIS nearby-feed query.

## User experience

### Onboarding

1. Explain the benefit before the system permission prompt: Dealy uses location
   to find savings nearby and does not expose the user's position to sellers.
2. Request `When In Use` location access.
3. If access succeeds, use a one-time/current fix to establish the discovery
   center and default to a 10-mile radius.
4. If permission is denied, restricted, unavailable, or times out, offer a
   city/ZIP field without blocking onboarding.
5. Persist the resulting discovery preference and continue to interests.

The app does not request background location.

### Home

Home remains focused on swiping:

- The deck uses the active discovery center and radius.
- Cards show approximate distance, such as `0.8 mi away`.
- Home does not contain the full radius slider or interactive map.
- If the deck has no matching local deals, show an explicit action to widen the
  radius or switch to `Anywhere`; never expand the radius silently.
- A location change from Search refreshes the deck immediately.
- Saved deals remain saved when location changes.

### Search/Explore

Search/Explore owns discovery controls:

- `Current location` refreshes from the device when authorized.
- `Search city or ZIP` resolves a manually selected discovery center.
- `Nearby` offers a 1–100 mile radius with a 10-mile default.
- `Anywhere` disables physical-distance filtering and displays online deals only.
- Applying any change updates global discovery state, Search results, and Home.

The existing Explore map entry becomes a Dealy+ surface. Free users see a limited
preview with a few obscured pins. Dealy+ later unlocks interaction, deal pins,
pan/zoom, and `Search this area`. This paywall does not prevent free users from
using location-based swipe discovery.

## Discovery state

Replace the Atlanta/campus-only assumption with one global discovery preference.
Conceptually:

```text
DiscoveryPreference
  mode: nearby | anywhere
  center:
    latitude
    longitude
    displayName
    source: device | manual | legacyCampus
  radiusMiles: 1...100
  updatedAt
```

Rules:

- `nearby` requires a valid center and radius.
- `anywhere` is online-only and ignores the center for feed requests.
- The most recent valid nearby center remains stored when switching to Anywhere,
  so switching back restores it.
- Existing campus selections migrate to `legacyCampus` coordinates.
- Invalid persisted values fall back to Atlanta at 10 miles without crashing.
- Only the selected/current discovery center is persisted. Dealy does not store
  a timeline of the user's movements.

`AppState` remains the single composition root and the owner of this preference.
Both Home and Search observe the same state, preventing divergent locations.

## iOS components

### Location provider

Replace the placeholder `LocationProviding` protocol with an async abstraction
that exposes:

- current authorization status;
- permission request;
- one current coordinate request;
- typed errors for denied, restricted, unavailable, timeout, and unknown states.

A `CoreLocationProvider` implements it with Apple's location framework. Tests and
previews use a deterministic mock provider.

The provider returns coordinates only. It does not mutate UI or preferences.

### Place resolver

Add a small `PlaceResolving` abstraction that converts a city or ZIP query into
one or more displayable location candidates. It uses Apple platform geocoding in
production and a mock resolver in tests.

The UI must require the user to select a candidate when a query is ambiguous.
An empty or failed result leaves the existing discovery location unchanged.

### Discovery coordinator

Add a focused coordinator or equivalent AppState methods responsible for:

- validating and applying a discovery preference;
- refreshing from device location;
- resolving and applying manual locations;
- switching between Nearby and Anywhere;
- triggering a feed reload only after a valid state change.

This isolates permission and geocoding work from SwiftUI views.

### Search location controls

Reshape `LocationSelectorView` into the Search-owned location sheet:

- current-location action and status;
- city/ZIP search and candidate selection;
- Nearby/Anywhere mode control;
- 1–100 mile slider for Nearby;
- Apply action.

The sheet edits draft state. Applying it performs one atomic global update and
reload, so Home and Search never render half-applied settings.

## Backend and feed contract

### Nearby

Continue using:

```http
GET /v1/feeds/nearby?lat={latitude}&lng={longitude}&radiusMiles={1...100}
```

Required backend change:

- raise the validated `radiusMiles` maximum from 50 to 100;
- retain PostGIS `ST_DWithin` filtering and distance ordering;
- keep distance cursor pagination;
- return only published, unexpired, geographically located deals.

### Anywhere

Add or expose a dedicated online feed contract:

```http
GET /v1/feeds/online
```

It returns only published, unexpired deals where `isOnline = true`, with cursor
pagination. The client must not simulate Anywhere by sending an enormous radius.

### Client service

Evolve `DealServicing` from an unparameterized `fetchDeals()` call to a
discovery-aware request:

```text
fetchDeals(for preference, cursor) -> DealPage
```

`RemoteDealService` maps Nearby to `/feeds/nearby` and Anywhere to
`/feeds/online`. `MockDealService` implements the same behavior for previews and
offline tests.

Feed refreshes caused by rapid location/radius changes must cancel or supersede
older requests. A late response for an old location must never replace the
current deck.

## Ranking and interaction signals

The nearby endpoint supplies eligible inventory. Ranking then prioritizes:

1. interest/category match;
2. distance within the selected radius;
3. savings amount and percentage;
4. deal freshness and expiration;
5. deal quality/reputation signals when available;
6. prior user behavior.

This build records or preserves the following events:

- impression;
- card open;
- left swipe;
- right swipe/save;
- redemption/click;
- mark used.

These events become inputs to the later personalization algorithm and Ask Dealy.
The initial ranking remains deterministic and explainable; no LLM participates
in feed eligibility or invents deals.

## Ask Dealy follow-on

Ask Dealy will live in Search/Explore as a recommended Dealy+ feature. It will
query only verified, active Dealy inventory and approved provider feeds. It may
use location, radius, interests, budget, saved/skipped/redeemed behavior, and
seller reputation.

Free users receive one introductory search with up to three results. Dealy+
unlocks follow-up questions and ongoing searches. Every result must link to a
real deal and explain why it matches. When nothing qualifies, Ask Dealy says so
and suggests changing constraints; it never fabricates inventory.

## Privacy and safety

- Request only `When In Use` authorization.
- Do not collect background location.
- Do not expose user coordinates to sellers, creators, or other users.
- Send coordinates only to Dealy's API for the active nearby query.
- Persist one selected discovery center, not location history.
- Use a clear manual fallback when permission is denied.
- Treat location denial as a normal supported state, not an error wall.
- Allow the user to replace device location with any city/ZIP.

## Error behavior

- **Permission denied/restricted:** explain briefly and offer city/ZIP.
- **Location timeout/unavailable:** retain the prior valid location and offer
  retry or manual search.
- **Ambiguous city/ZIP:** show selectable candidates.
- **No geocoding result:** show an inline error and do not mutate active state.
- **No nearby inventory:** offer wider radius or Anywhere.
- **Backend offline/error:** retain saved deals and prior deck where possible,
  show retry, and do not reset discovery preferences.
- **Stale response:** discard it when its request identity no longer matches the
  active discovery preference.

## Testing

### iOS unit tests

- authorization-state and provider error mapping;
- discovery preference validation and legacy-campus migration;
- radius clamping at 1 and 100;
- Nearby/Anywhere transitions;
- manual location success, ambiguity, and failure;
- atomic application of Search changes to global AppState;
- stale request cancellation/response rejection;
- saved deals surviving location changes.

### iOS UI tests

- allow location during onboarding;
- deny location and complete onboarding with ZIP/city;
- change radius in Search and observe Home refresh;
- switch to Anywhere and see online-only cards;
- empty nearby deck prompts widening instead of silently changing radius;
- free-user map preview remains noninteractive.

### Backend tests

- nearby query accepts 1 and 100 miles and rejects values outside the range;
- geospatial boundary inclusion/exclusion;
- expired, unpublished, and coordinate-less deals are excluded from Nearby;
- online endpoint returns only active online deals;
- cursor pagination remains stable;
- category filters continue to work.

## Delivery sequence

1. Introduce discovery preference and migrate existing persisted campus state.
2. Implement Core Location provider and manual place resolver.
3. Build onboarding permission/fallback flow.
4. Move location/radius controls into Search and connect them to global state.
5. Make deal service requests discovery-aware.
6. Extend nearby backend radius to 100 miles and add the online-only endpoint.
7. Refresh Home and Search atomically with stale-request protection.
8. Add analytics events and complete unit, UI, and backend verification.

## Success criteria

- A first-time user in any supported region can permit location and see deals
  around their actual position.
- A user who denies location can obtain the same experience by choosing a city
  or ZIP.
- Search location changes immediately affect the Home swipe deck.
- Nearby never returns deals beyond the selected radius.
- Anywhere returns online deals only.
- The feature requires no paid third-party location API.
- Existing saves and swipe history remain intact through migration.
- The design leaves clean inputs for later personalization and Ask Dealy.
