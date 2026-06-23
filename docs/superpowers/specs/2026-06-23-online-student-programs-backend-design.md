# Online Student Programs — Backend (3a) Design

**Date:** June 23, 2026
**Status:** Approved for implementation planning
**Scope:** Backend only. Serve real, curated, link-verified national student-discount programs (Apple Education, Spotify Student, GitHub Student Pack, …) through a production feed path, clearly labeled `curated` (never `verified`). This is sub-project 3a; the iOS Student Perks UI + MapKit nearby-redemption finder is 3b (separate spec) and consumes this contract.

## Product goal

Students should discover the major online student-discount programs inside Dealy.
There are no partner APIs that vend these as a feed, so Dealy curates them: real
programs, real official URLs, real terms — surfaced honestly.

Governing rules, carried from the parent spec:

- **REAL DATA ONLY.** Every program is a real, currently-offered student program
  with an official `destinationUrl`. No fabricated discounts or prices.
- **Honest trust labeling.** Curated programs derive to the **`curated`** feed
  tier and **never** wear the Verified badge (which stays reserved for
  authoritative, API-confirmed deals).
- **Never gates access.** These are online/national inventory — always available
  to every user regardless of campus or location.

## Scope boundary

**3a delivers (backend):**
1. A `StudentProgramsProvider` (trust `editorial`) returning a curated catalog of
   real student programs — production-visible, not fixtures-gated.
2. A `redemptionBrand` field on the deal model/DTO so 3b knows which programs
   have a physical-store redemption and what to search for.
3. A production feed path: `GET /v1/feeds/student` plus inclusion of curated
   student-online deals in the existing nearby-feed backfill blend.
4. A link-verification pass that checks each program's `destinationUrl` is live
   and flags failures for manual review instead of auto-archiving.

**3a does NOT deliver:** the iOS Student Perks section, the MapKit
`MKLocalSearch` nearby-store finder, or the "Get Deal Online / Find Nearby"
detail UI — all 3b.

## Architecture

### 1. StudentProgramsProvider

New provider implementing the existing `DealProvider` interface
(`backend/src/ingestion/normalized-deal.ts`):

- `name = 'student-programs'`
- `trust = 'editorial' as const`
- `isAvailable() => true` (inline data, no credentials)
- `fetch()` returns the curated catalog as `NormalizedDeal[]`
- `verify(deal)` performs the link-liveness check (see §4)

Registered in `ProviderRegistry` (`backend/src/ingestion/provider-registry.ts`)
**unconditionally** (alongside the always-on authoritative providers), NOT inside
the `fixturesEnabled()` block — so it serves production. This is the deliberate
departure from the existing dev-only `EditorialProvider`.

Each program normalizes with:
- `isOnline: true`, `isStudentOnly: true`
- `currentPriceMinor: null`, `originalPriceMinor: null` for variable-discount
  programs (title/terms carry the real offer; we never invent a price)
- `destinationUrl` and `sourceUrl`: the official program page
- `locationTags: ['online', 'nationwide']`
- `redemptionBrand`: a search term for physical redemption, or null (see §2)
- `categorySlug`: `'tech'` for hardware/software, `'entertainment'` for media, etc.
- `externalId: 'student-' + slug` (idempotent upserts)
- `providerAttribution: 'Curated by Dealy'`

Ingested deals derive to the **`curated`** feed tier
(`sourceTrust='editorial' && moderationStatus='approved' && status='published'`),
so they never show a Verified badge.

### 2. The redemptionBrand field

A new optional string on the deal, threaded end to end so 3b can offer "Find
Nearby" only where it makes sense:

- Prisma: `redemptionBrand String? @map("redemption_brand")` on `Deal`
- `NormalizedDeal.redemptionBrand?: string`
- Ingestion upsert writes it
- `DealDto.redemptionBrand: string | null`; mapper passes it through
- iOS `DealDTO` (3b) reads optional `redemptionBrand` → `Deal.redemptionBrand: String?`

Programs with physical redemption set it (Apple → `"Apple Store"`, Samsung →
`"Best Buy"`, Microsoft → `"Microsoft Store"`). Pure-digital programs (Spotify,
GitHub, Adobe, Notion, Canva, Figma, JetBrains, Prime, Dell, Lenovo) leave it
null. The actual store lookup is on-device MapKit in 3b — no server-side store
data.

### 3. Production feed path

Curated online deals currently have no production route (the online feed is
authoritative-only; the nearby feed backfills only with authoritative online).
Two additions in `backend/src/feeds/`:

1. **`GET /v1/feeds/student`** — a new endpoint serving curated, published,
   unexpired, `isOnline && isStudentOnly` deals, newest-first, keyset-paginated
   (`limit` default 20, `cursor`). No location required. Returns `DealPage`
   (`items`, `nextCursor`) with `trustLevel: 'curated'` on each item.
2. **Nearby backfill blend** — extend the existing nearby-feed online backfill
   (`feeds.service.ts`) to also append curated `isStudentOnly` online deals when
   the physical page is under the limit, so they appear during normal browsing.
   They remain tier-labeled `curated`.

The authoritative-only `GET /v1/feeds/online` is unchanged.

### 4. Link verification

The daily verification sweep (`backend/src/ingestion/verification.service.ts`)
currently `continue`s past any non-authoritative provider. We add a curated-link
liveness pass for the student-programs provider:

- For each active student program, issue an HTTP `HEAD` (fall back to `GET`) on
  `destinationUrl` with a short timeout.
- 2xx/3xx → healthy: refresh `lastVerificationAttemptAt`; the deal stays
  published. (It is **not** marked `verified` — curated deals never are.)
- Failure (4xx/5xx/timeout/unreachable) → set `verificationFailureReason` and
  surface for manual review; **do not** archive or hide. These are stable,
  hand-vetted programs; transient link issues must not yank real inventory.

This honors "link-verified" without fragile auto-deletion. Operator tooling to
action flagged programs is out of scope (the field + log line suffice for 3a).

### 5. v1 catalog

All real, with official URLs. `redemptionBrand` noted where physical redemption
exists:

| Program | Category | redemptionBrand |
|---|---|---|
| Apple Education | tech | Apple Store |
| Samsung Education | tech | Best Buy |
| Microsoft Education | tech | Microsoft Store |
| Dell Student | tech | null |
| Lenovo Student | tech | null |
| Adobe Student | tech | null |
| GitHub Student Pack | tech | null |
| JetBrains Students | tech | null |
| Figma Education | tech | null |
| Notion Education | tech | null |
| Canva Education | tech | null |
| Spotify Student | entertainment | null |
| Prime Student | entertainment | null |

## Data flow

```
StudentProgramsProvider.fetch()  →  NormalizedDeal[]  (editorial, online, studentOnly, redemptionBrand?)
        ↓ ingestion.service upsert (sourceTrust=editorial, moderation=approved, status=published, verification=pending)
        ↓ deriveFeedTier → 'curated'
GET /v1/feeds/student  →  DealDto[] (trustLevel='curated', redemptionBrand)   ← 3b Student Perks section
GET /v1/feeds/nearby   →  …physical… + curated studentOnly online backfill    ← 3b blended browsing
verification sweep     →  HEAD destinationUrl → healthy | flagged-for-review (never archived)
```

## Error handling

- Provider always available; an empty catalog yields an empty (never broken) feed.
- A malformed/missing `destinationUrl` in the catalog is a developer error caught
  by provider unit tests, not a runtime path.
- Link-check network failures are swallowed into `flagged-for-review`, never
  thrown to callers or feed requests.
- `/v1/feeds/student` with no curated inventory returns an empty page, not an error.

## Testing

- **Provider unit tests:** every program has a non-empty official `destinationUrl`
  (https), a valid category slug, `isOnline === true`, `isStudentOnly === true`;
  programs carrying a `redemptionBrand` are exactly the known physical-redemption
  subset (Apple/Samsung/Microsoft); `externalId`s are unique.
- **Feed-tier test:** a curated student program derives to `'curated'`, never
  `'verified'`.
- **`/v1/feeds/student` test:** returns only curated, published, unexpired,
  studentOnly online deals; respects `limit`/`cursor`; each item's `trustLevel`
  is `curated` and carries `redemptionBrand` (string or null).
- **`/v1/feeds/online` unchanged:** still authoritative-only; curated student
  programs do NOT leak into it.
- **Nearby backfill test:** when physical inventory is short, curated student
  online deals appear in the nearby page, tier-labeled `curated`.
- **Link-verification test:** a healthy URL keeps the deal published and
  unverified; a failing URL sets `verificationFailureReason` and keeps the deal
  published (not archived).
- **DTO test:** `redemptionBrand` round-trips through the mapper (string and null).

## Out of scope (explicit)

- iOS Student Perks UI, detail view, "Get Deal Online / Find Nearby" actions (3b).
- MapKit `MKLocalSearch` nearby-store finder (3b).
- Operator review dashboard for flagged programs.
- Affiliate/partner API integration (deferred; could later upgrade a program to
  `authoritative` if a real API confirms it).
- Real student eligibility verification (SheerID etc.).
