# Cross-Campus Trending Design

**Date:** June 23, 2026
**Status:** Approved for implementation planning
**Scope:** Backend + iOS. Light up the `TrendingCampusDeals` slot (built earlier) with a deterministic, rule-based trending definition, serve trending deals to every campus regardless of location, and surface them in a dedicated "Trending" section in the app.

## Product goal

When an exceptional promotion appears near one supported campus, feature it to
students at all four — "50% off restaurant special near KSU, today only" reaches
GSU/GT/UGA users too. This creates discovery and excitement. The slot
(`Deal.isTrending`, `InventoryClass.trending`, the four-class blend) already
exists; nothing populates it yet.

Governing rules: deterministic + explainable; REAL DATA ONLY (a trending deal is
a real verified deal, never fabricated); cross-campus deals are framed as
**discovery** with honest distance, never "near you."

## Scope boundary

**Delivers:**
- Backend: a derived `isTrending` on `DealDto` (computed at map time) + a
  location-independent `GET /v1/feeds/trending` returning the trending-rule deals.
- iOS: `.trending` feed fetch, `AppState.trendingDeals`, and a dedicated
  "Trending" section + "See all" list in Explore.

**Does NOT deliver:** popularity/engagement weighting (dormant pre-launch;
documented future upgrade — the analytics events feed it, no read-back wired);
deck injection (chosen: dedicated section); any DB schema change.

## The trending rule

A deal is trending when it is **authoritative AND verified** AND **exceptional**:

```
isTrending = (sourceTrust == 'authoritative' && verificationStatus == 'verified')
             && (savingsPercentage >= 50 || endsWithinHours(48))
```

- `savingsPercentage` is derived from price (already computed in the mapper).
- `endsWithinHours(48)`: `expiresAt - now <= 48h` (and still in the future).
- Curated/price-0 student programs have `savingsPercentage == 0` and aren't
  authoritative → never trending (they stay `.national`).

Rationale: deterministic, works pre-launch with zero traffic, and matches the
"50% off / today only" example. Popularity is intentionally excluded for now.

## Architecture

### Backend

1. **`deriveTrending(deal)`** — a pure function (in or beside `deal.mapper.ts`)
   implementing the rule above from the normalized fields the mapper already has
   (`sourceTrust`, `verificationStatus`, `currentPriceMinor`/`originalPriceMinor`,
   `expiresAt`). `toDealDto` sets `isTrending` from it. `DealDto` gains
   `isTrending: boolean`. Emitted on EVERY feed, so `isTrending` is a true
   property of the deal wherever it appears.
2. **`FeedsService.trending(limit)`** — queries published, authoritative,
   verified, unexpired deals with **no geo filter**, keeps only those where
   `deriveTrending` is true, sorts strongest-savings-first (tiebreak `dealScore`,
   then `id`), returns `DealPage`. Location-independent by design.
3. **Controller:** repoint `GET /v1/feeds/trending` to `FeedsService.trending`.
   The popularity-based `RecommendationsService.trending` stays in the codebase
   (unused by the route) for a future popularity upgrade.

### iOS

4. **`DealDTO`** already decodes `isTrending: Bool?` and `Deal.isTrending`
   exists; `InventoryClassifier` already maps `.trending`. Backend now populates
   it — no model change.
5. **`DealFeedRequest.trending`** → `RemoteDealService` GETs `/v1/feeds/trending`
   (no online-filtering); `MockDealService` returns a high-value subset as the
   trending set for previews/offline.
6. **`AppState.trendingDeals: [Deal]` + `loadTrendingDeals()`** — mirrors
   `studentDeals`/`loadStudentDeals`: stores results, merges into `dealsByID`,
   empty on failure, never blocks.
7. **`TrendingSection` + `TrendingListView`** in Explore — same pattern as
   `StudentPerksSection`/`StudentPerksListView`. `SectionHeader("Trending",
   symbol: "flame.fill")`, `DealRowCard`s, "See all" push, `EmptyStateView` when
   empty. Cards show honest distance for physical deals (the existing
   `DealRowCard` already renders distance). Tapping opens the existing
   `DealDetailView` sheet. `ExploreView` loads it in `.task`.

## Data flow

```
backend toDealDto → isTrending = deriveTrending(deal)   (every feed)
GET /v1/feeds/trending → FeedsService.trending → DealPage (trending-rule, no geo, savings desc)
iOS ExploreView .task → AppState.loadTrendingDeals() → dealService.fetchDeals(.trending)
   → trendingDeals (+ merged into dealsByID)
TrendingSection / TrendingListView render DealRowCards → DealDetailView sheet
InventoryClassifier.classify(deal) → .trending when isTrending (already built)
```

## Error handling / edge cases

- No trending inventory → `/v1/feeds/trending` returns an empty page; the section
  renders `EmptyStateView` (not an error).
- A trending deal with no price (shouldn't happen for authoritative) → `savingsPercentage`
  guard returns 0 → only the urgency clause can make it trend.
- iOS feed failure → `trendingDeals` empty; app unaffected.
- Physical trending deals far from the user → shown with truthful distance.

## Testing

**Backend:**
- `deriveTrending` truth table: authoritative+verified+55% → true; authoritative+verified+endingSoon → true; authoritative+verified+10%+not-urgent → false; editorial/unverified → false regardless of savings.
- `mapPrismaDeal` emits `isTrending` correctly for a high-value verified deal vs a low-value one.
- `/v1/feeds/trending` (e2e): returns only trending-rule deals with `isTrending: true`, includes a far high-value deal (location-independent), excludes a verified-but-unexceptional deal.

**iOS:**
- `DealDTO` decodes `isTrending: true`.
- `RemoteDealService` routes `.trending` → `/v1/feeds/trending` and maps items.
- `MockDealService` `.trending` returns only high-value deals.
- `AppState.loadTrendingDeals()` populates `trendingDeals` and resolves via `deal(id:)`; failure → empty.

## Out of scope (explicit)

- Popularity/engagement weighting (future; needs read-back of interaction aggregates).
- Deck injection (dedicated section chosen).
- DB schema / migration (rule is derived at query time).
- Notifications for trending deals.
