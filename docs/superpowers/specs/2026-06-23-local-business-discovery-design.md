# Local-Business 15mi Discovery Design

**Date:** June 23, 2026
**Status:** Approved for implementation planning
**Scope:** Backend + iOS. Surface REAL local deals (restaurants, happy hours, campus student-discounts, grocery, local promos) within 15 miles of the user, sourced by the existing curated crawler over the real Atlanta seed URLs already in `crawl_sources`, in a dedicated "Local Deals" curated section.

## Product goal

Students should see real nearby savings — the taco spot, the campus dining
special, the coffee discount — not just verified events. These come from the
curated crawler, so they are `editorial`/`curated` trust (link/extraction-based,
not API-confirmed) and are presented honestly as **Curated**, never Verified.

This is the honest answer to "where are the local deals": the crawler and real
Atlanta seed URLs already exist but are disabled and unrun. This subsystem
enables them, gives crawled deals a place to surface (a 15mi Local Deals
section), and publishes high-confidence extractions automatically.

## Honest constraints (carried into the design)

- **REAL DATA ONLY.** Local deals come from real pages via structured (JSON-LD)
  extraction + an LLM fallback (needs `ANTHROPIC_API_KEY`). No fabricated deals.
- **Modest, variable yield.** ~11 seed pages won't flood the app; menu pages
  often aren't deals, campus "specials" pages are richer. The set grows as
  better deal-specific sources are curated. The implementation reports the
  actual ingested count — no padding.
- **Curated, not Verified.** These never wear the Verified badge and do NOT
  count toward density-first coverage (which remains authoritative-verified
  only). They live in their own ungated section, separate from the verified
  nearby deck.
- **Scraping is operator responsibility.** Third-party site ToS/robots apply;
  the crawler's robots handling (where present) is respected, and enabling
  scraping of specific sources is the operator's explicit choice.

## Architecture

### Backend

1. **Enable the real Atlanta seed sources.** The `crawl_sources` table already
   holds real URLs (The Varsity, Mary Mac's, Fox Bros BBQ, Ponce City Market,
   GSU/GT dining specials, Publix/Kroger circulars, BeltLine, Discover Atlanta),
   all `enabled=false`. Flip the curated ones to `enabled=true` (leave the
   `example.test` fixture disabled). Delivered as a seed/migration step + a CLI
   that the operator runs.
2. **Auto-publish high-confidence extractions.** Configure the crawler's existing
   gate: `CRAWLER_AUTOPUBLISH_THRESHOLD=70` and a geocode-confidence floor, so a
   crawled deal scoring ≥70 with a confident geocode publishes straight to the
   Local Deals section (`status=published`, `moderationStatus=approved`,
   `sourceTrust=editorial`). Below threshold → stays in the moderation queue. No
   new code — this is the crawler's documented behavior, configured on.
3. **`GET /v1/feeds/local`** — new `FeedsService.local(q)`:
   `?lat&lng&radiusMiles=15&category=&limit=`. A PostGIS `ST_DWithin` query
   returning `editorial` + `moderationStatus=approved` + `status=published` +
   physical (`geog NOT NULL`) + unexpired deals within the radius, ordered by
   distance. Optional category filter. **Not coverage-gated** — it is the
   curated discovery surface; the gated verified deck (`/feeds/nearby`) is
   separate. Returns `DealPage` (items carry `trustLevel: 'curated'`,
   `distanceMiles`).

### iOS

4. **`DealFeedRequest.local(center: DiscoveryCenter, radiusMiles: Int)`** →
   `RemoteDealService` GETs `/v1/feeds/local` with the coordinate + radius (default
   15). `MockDealService` returns mock local curated deals.
5. **`AppState.localDeals` + `loadLocalDeals()`** — resolves the active discovery
   coordinate (device fix or current center), fetches local deals at 15mi, stores
   them, merges into `dealsByID`. Empty on failure; never blocks.
6. **"Local Deals" section + "See all" list** in Explore (mirrors Student
   Perks/Trending): `SectionHeader("Local Deals", "fork.knife")`, `DealRowCard`s
   with distance + category, labeled Curated, honest `EmptyStateView` when the
   crawler hasn't populated anything yet. Tapping opens the existing detail sheet.

### Operational (verification, not code)

7. Enable seeds → run `pnpm crawl` → confirm auto-publish → report the ACTUAL real
   deals ingested + screenshot the Local Deals section on the sim with whatever
   real data results. If yield is low, say so and note which sources produced.

## Data flow

```
crawl_sources (enabled real Atlanta URLs)
  → pnpm crawl → StructuredExtractor / LlmExtractor → geocode → confidence score
  → auto-publish if score≥70 (else moderation queue) → editorial/approved/published deal (geog)
GET /v1/feeds/local?lat&lng&radiusMiles=15 → FeedsService.local → ST_DWithin curated query → DealPage
iOS ExploreView .task → AppState.loadLocalDeals() → dealService.fetchDeals(.local(center,15))
  → localDeals (+ dealsByID) → "Local Deals" section → DealDetailView
```

## Error handling / edge cases

- No location → can't anchor local; section shows an "enable location" empty
  state (mirrors the nearby-redemption sheet pattern). Never fabricates a center.
- No crawled inventory yet → empty section with an honest message.
- Crawl/extraction failure on a source → that source is skipped; others proceed
  (crawler already isolates per-source failures).
- Local feed never coverage-gates, so it works outside dense zones (curated
  discovery is the point).

## Testing

**Backend:**
- `FeedsService.local` (e2e, DB): seed an editorial+approved+published physical
  deal within 15mi and one >15mi; assert only the in-radius one returns, ordered
  by distance, `trustLevel: 'curated'`. Assert an authoritative-verified physical
  deal does NOT appear (local is curated-tier only — events stay in the verified
  nearby deck), and online deals never appear (physical only).
- Category filter narrows results.

**iOS:**
- `RemoteDealService` routes `.local(...)` → `/v1/feeds/local` with lat/lng/radius
  query params (StubURLProtocol).
- `MockDealService` `.local` returns physical curated deals only.
- `AppState.loadLocalDeals()` populates `localDeals` + resolves via `deal(id:)`;
  failure → empty.

## Out of scope (explicit)

- Generic business directory (every nearby business) — this is deal-focused.
- A places API (Google/Yelp/Foursquare) integration — deferred; the crawler is
  the source.
- Promoting curated deals into the verified tier (rejected earlier — curated
  stays curated).
- Coverage-gating the local feed.
- Notifications for local deals.
- New crawler/extraction code — this uses the crawler as-is, enabled + configured.
