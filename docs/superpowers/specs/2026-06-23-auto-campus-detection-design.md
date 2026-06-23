# Dealy Auto-Campus Detection Design

**Date:** June 23, 2026  
**Status:** Approved for implementation planning  
**Initial implementation scope:** Automatic campus assignment from device location, wired only into ranking/personalization — never into deal access. Plus the feed-composition and dollars-saved analytics contracts these depend on.

## Product goal

Dealy must **never ask a user what school they attend.** The active campus is
determined automatically from device location. Campus assignment exists to make
local results more relevant — it is **advisory input to ranking and
personalization, never an access gate.**

The governing principle for this build:

> **Location determines local relevance, not access.** A user can always save
> money on Dealy regardless of where they are or whether they grant location.

### Critical product requirements (core, not future)

1. **No manual school selection in onboarding.** Campus is auto-assigned.
2. **Campus assignment can never gate access to deals.** It only reorders and
   boosts; it can never remove a deal from the feed.
3. **The feed is a blend of four inventory classes:** Local + Online +
   Trending + National. Online, Trending, and National are always available
   to every user; Local is layered in when the user is near a campus.
4. **TrendingCampusDeals is a first-class concept** — high-value promotions
   surface across all supported campuses, not just the one a deal is near.
5. **Analytics are centered on total student dollars saved** — the primary
   KPI. Deal counts are secondary.

### Supported campuses

The four real campuses, used for matching:

- Georgia State University (Downtown Atlanta)
- Georgia Tech (Midtown Atlanta)
- Kennesaw State University
- University of Georgia (Athens)

The existing `atlanta` entry is a meta-anchor, **excluded from campus
matching** — it is not a school. Georgia State and Georgia Tech sit ~2.5 miles
apart; nearest-wins resolves between them.

## Scope boundary — what this build delivers vs. what it scaffolds

This is the first sub-project of a larger product spec. To keep it coherent and
honest:

**This build delivers:**

- A pure `CampusLocator` that turns a coordinate (or `nil`) into a
  `CampusAssignment`.
- Onboarding wired to auto-assign with no campus prompt.
- Foreground re-detection on every launch/activation.
- A demoted, optional manual override in Settings (correction escape hatch).
- The **architectural contract** that campus assignment feeds only
  ranking/personalization and is provably incapable of removing deals.
- First-class `TrendingCampusDeals` and the **four-class feed blend** defined
  as the feed's composition model, with the slots wired so later inventory
  drops in without re-architecture.
- A **dollars-saved analytics event** emitted on redemption/use, establishing
  the KPI pipeline.

**This build explicitly does NOT deliver (next sub-projects, depend on
inventory that does not exist yet):**

- The online/national student catalog itself (Apple Education, Spotify Student,
  GitHub Student Pack, Adobe Student, etc.).
- The MapKit "find nearest redemption store" finder.
- The cross-campus trending **ingestion** that populates TrendingCampusDeals
  with real promotions.

Where inventory does not yet exist, this build builds the **slot and the
contract**, not fabricated data. No mock or placeholder deals are introduced.

## API requirements

No paid third-party API or key is required for campus detection:

- Apple Core Location supplies the device coordinate after `When In Use`
  permission (already implemented via `CoreLocationProvider`).
- Distance to each campus is pure local arithmetic (haversine) over four fixed
  points.
- No backend round-trip is used to assign a campus; assignment is offline-safe.

The backend's existing PostGIS nearby-feed and tiered blending remain the source
of real inventory. This build does not add a paid provider.

## Architecture

### CampusLocator (the core, pure value type)

```swift
enum CampusAssignment {
    case assigned(Campus, distanceMiles: Double)            // within threshold
    case outOfRange(nearest: Campus, distanceMiles: Double) // beyond threshold
    case unavailable                                        // no location/fix
}

enum CampusLocator {
    static let campusMatchRadiusMiles = 30.0
    static func locate(from coordinate: CLLocationCoordinate2D?) -> CampusAssignment
}
```

- Computes haversine distance from the coordinate to each of the four campus
  centers; nearest wins.
- `campusMatchRadiusMiles = 30` is a **dedicated constant**, distinct from each
  campus's `defaultRadius` (which is the deal-search radius, a different
  concept).
- `nil` coordinate → `.unavailable`. Within 30 mi → `.assigned`. Beyond 30 mi →
  `.outOfRange`, retaining which campus was nearest for honest UI
  (e.g. "240 mi from UGA").
- Equidistant ties break deterministically by campus id.
- Zero UI/network dependencies — fully unit-testable.

### State semantics (advisory, never gating)

| State | Local deals | Online deals | National deals | Trending campus deals |
|---|---|---|---|---|
| `assigned` | Shown; campus promos **boosted** | Always | Always | Always |
| `outOfRange` | No local boost (little/no nearby inventory anyway) | Always | Always | Always |
| `unavailable` | None until location granted; may prompt later | Always | Always | Always |

No state removes Online, National, or Trending inventory. The only thing that
varies across states is the presence and boosting of **Local** results.

### Data model

`DiscoveryPreference` / `DiscoveryCenter` gains the assignment result:

- `assignedCampus: Campus?`
- `matchState: { assigned | outOfRange | unavailable }`
- `distanceMiles: Double?`
- `manualOverride: Bool`

The active **coordinate** still anchors the local radius query (unchanged
backend contract). The campus identity feeds `DealRanker` as an additive
campus-relevance boost — never a filter.

### The four-class feed blend

The feed is composed of four inventory classes; campus assignment changes only
the **weighting and presence of Local**, never the availability of the others:

1. **Local** — nearby restaurants, coffee shops, businesses within the search
   radius. Present only when a usable coordinate exists; boosted when
   `assigned`. Maps to the backend's existing VERIFIED/CURATED tiers.
2. **Online** — student-eligible online deals (catalog arrives in a later
   sub-project). Maps to the backend ONLINE tier. Always available.
3. **National** — non-campus-specific student savings programs. Always
   available. (Inventory arrives later; the slot exists now.)
4. **Trending** (`TrendingCampusDeals`) — high-value promotions surfaced across
   all supported campuses regardless of which campus they originate near.
   Always available.

This build defines the blend as the feed's composition model and ensures the
Online/National/Trending slots are unconditionally populated from whatever real
inventory exists, with no dependence on campus state. It does not fabricate
inventory for empty slots.

### TrendingCampusDeals (first-class concept)

A trending deal is a high-value promotion that should reach students at every
supported campus, not only the one it is geographically near. Example: a 50%
restaurant special near KSU is featured to GSU, Georgia Tech, and UGA users.

This build introduces TrendingCampusDeals as a named, first-class part of the
feed-composition model and a feed slot that is always present and never gated by
campus assignment. The **ingestion/selection logic that decides which real
deals are trending** is a follow-on sub-project; this build does not invent
trending deals.

### Dollars-saved analytics (primary KPI)

The success metric is **total dollars saved by students**, not number of deals.
This build establishes the KPI pipeline:

- On a redemption/use action, emit an analytics event carrying the deal's
  estimated savings amount, campus context (assigned campus or none), and
  inventory class (Local/Online/National/Trending).
- Counts and impressions are secondary signals; the headline metric is summed
  dollars saved.

This build emits the event and defines its shape. Dashboards/reporting are out
of scope.

## User experience

### Onboarding

1. Explain the location benefit before the system prompt (unchanged).
2. Request `When In Use` location access.
3. Run `CampusLocator.locate(...)` on the resulting coordinate (or `nil`).
4. Store the assignment and continue. **No campus prompt is ever shown** — any
   of `assigned`, `outOfRange`, or `unavailable` completes onboarding and loads
   the feed.

### Foreground re-detection

On `scenePhase → .active`, re-run the one-shot location fix and
`CampusLocator`, then update the active assignment. This is skipped while a
manual override is active so the app never stomps a user's correction.

### Settings override (demoted correction)

`LocationSelectorView` is reframed as a quiet "Change campus" correction, not a
primary flow:

- Selecting a campus sets `manualCampusOverride = true`.
- A "Use my location" reset clears the override and resumes auto-detection.

The override exists only to correct wrong detection; it is never part of the
default path.

## Error handling

- **Location denied/restricted/timeout:** `CampusLocator` receives `nil` →
  `.unavailable`. Onboarding still completes; Online/National/Trending remain
  available. The app may later prompt for location if the user wants nearby
  deals.
- **Coordinate far from all campuses:** `.outOfRange` with nearest campus
  retained for honest messaging. No local boost; all other inventory intact.
- **Equidistant / ambiguous:** deterministic tiebreak by campus id.
- **Stale fix:** foreground re-detection refreshes assignment each activation.

## Testing

TDD the `CampusLocator` first:

- In-range assignment for each of the four campuses.
- GSU-vs-GT proximity tiebreak (nearest wins).
- Just-inside vs. just-outside the 30-mile boundary.
- Equidistant determinism.
- `nil` coordinate → `.unavailable`.

Contract tests encoding the product rules as executable guarantees:

- An `outOfRange` assignment does **not** reduce the set of non-local deals
  returned versus an `assigned` one.
- An `unavailable` assignment still yields all Online/National/Trending
  inventory.
- The four-class blend always includes the Online/National/Trending slots
  irrespective of campus state.
- A redemption emits a dollars-saved analytics event carrying the savings
  amount, campus context, and inventory class.

## Out of scope (explicit)

- Online/national student catalog inventory (Apple Education, Spotify, GitHub
  Student Pack, Adobe, etc.).
- MapKit nearest-redemption-store finder.
- Real trending-deal ingestion/selection.
- Analytics dashboards/reporting.
- Removing `MockDeals.swift` / editorial fixtures (the real-data-only purge is
  its own sub-project).
