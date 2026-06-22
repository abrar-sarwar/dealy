# Curated Deal Crawler — Design

**Status:** Approved (brainstorm) · **Date:** 2026-06-22 · **Branch target:** `feature/atlanta-verified-pilot` (or a dedicated `feature/curated-crawler`)

## Goal

Add a curated deal crawler to Dealy's NestJS backend: crawl public deal sources
(restaurant sites, happy-hour pages, student-discount pages, grocery circulars,
local-business promo pages), extract deal candidates, normalize them into the
existing `Deal` schema, assign a **CURATED** feed tier, queue them for human
moderation, and publish only after approval. Update feed ranking to a
trust-tiered, never-empty blend: **VERIFIED > CURATED > COMMUNITY**.

## Key decisions (from brainstorm)

1. **Feed philosophy:** tiered, badge-honest blend. One ranked feed; "Verified"
   stays authoritative-only; every card carries an honest trust badge; the feed
   blends down the tiers (and expands radius) before it is ever empty.
2. **Extraction engine:** hybrid — deterministic structured extraction first
   (JSON-LD / microdata / regex), Claude LLM fallback only when a page exposes no
   structured data. `confidence_score` reflects which path ran and field agreement.
3. **v1 scope:** crawler + moderation + feed ranking. COMMUNITY tier is reserved
   (enum value + ranking slot only) — no user-submission ingest path in v1.
4. **Geocoding:** pluggable `Geocoder` interface; `NominatimGeocoder` default
   (free, key-less), `MapboxGeocoder` when `GEOCODER_KEY` is set. Moderation
   catches bad geocodes before publish.

## 1. Trust model: two axes, kept separate

The spec's `trust_level` conflates provenance with display ranking. We keep them
as two fields so nothing dilutes the meaning of "Verified".

- **`source_trust`** (existing enum `authoritative | editorial | fixture`) —
  provenance. Controls verification / badging / coverage eligibility. **Unchanged.**
  The crawler is an `editorial`-trust provider.
- **`feed_tier`** (NEW type `verified | curated | community`) — a **derived**
  display + ranking tier. **Not stored** — computed deterministically from
  `(source_trust, verification_status, moderation_status)` by a single shared
  helper (`deriveFeedTier()` in TS for the DTO, mirrored as a SQL `CASE` for feed
  ordering), so it can never drift out of sync with verification/moderation state:
  - `authoritative` + `verified` → **verified**
  - `editorial` + `approved` + published → **curated**
  - otherwise → **community** (reserved; no ingest path in v1)

`feed_tier` is the spec's `trust_level`, surfaced on the deal DTO. Only
`authoritative`+`verified` inventory is ever badged "Verified" or counted toward
coverage qualification — the existing honesty remediation is preserved at the
badge/verification layer. Deriving (rather than storing) means the daily
re-verification job already updates the tier for free: when a deal's
`verification_status` flips, its derived tier follows with no extra write path.

## 2. Data model changes (Prisma)

`feed_tier` is a derived TS union type (`'verified' | 'curated' | 'community'`),
NOT a Prisma column — see §1. No `FeedTier` enum / column / backfill is added.

`Deal` gains only two real columns:
- `confidenceScore Int? @map("confidence_score")` — 0–100, crawler candidates only.
- `crawlSourceId String? @map("crawl_source_id") @db.Uuid` + relation to `CrawlSource`.

The existing `@@index([status, verificationStatus, expiresAt])` already serves the
VERIFIED step; the CURATED step adds `@@index([status, moderationStatus, expiresAt])`
for the curated-in-radius read.

New models (mirror `IngestionRun` / `IngestionFailure` for observability):

```prisma
model CrawlSource {
  id                String     @id @default(uuid()) @db.Uuid
  url               String     @unique
  kind              CrawlKind
  merchantHint      String?    @map("merchant_hint")
  defaultCategorySlug String?  @map("default_category_slug")
  zoneSlug          String?    @map("zone_slug")          // optional coverage-zone hint
  enabled           Boolean    @default(true)
  crawlIntervalHours Int       @default(24) @map("crawl_interval_hours")
  lastCrawledAt     DateTime?  @map("last_crawled_at")
  createdAt         DateTime   @default(now()) @map("created_at")
  deals             Deal[]
  runs              CrawlRun[]
  @@index([enabled])
  @@map("crawl_sources")
}

enum CrawlKind {
  restaurant
  happy_hour
  student_discount
  grocery_circular
  local_promo
  @@map("crawl_kind")
}

model CrawlRun {
  id          String        @id @default(uuid()) @db.Uuid
  sourceId    String        @map("source_id") @db.Uuid
  status      IngestionStatus @default(running)   // reuse existing enum
  fetched     Int           @default(0)           // candidates extracted
  queued      Int           @default(0)           // upserted as pending
  deduped     Int           @default(0)
  failed      Int           @default(0)
  error       String?
  startedAt   DateTime      @default(now()) @map("started_at")
  finishedAt  DateTime?     @map("finished_at")
  source      CrawlSource   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  failures    CrawlFailure[]
  @@index([sourceId, startedAt])
  @@map("crawl_runs")
}

model CrawlFailure {
  id         String   @id @default(uuid()) @db.Uuid
  runId      String   @map("run_id") @db.Uuid
  url        String?
  reason     String
  createdAt  DateTime @default(now()) @map("created_at")
  run        CrawlRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@index([runId])
  @@map("crawl_failures")
}
```

**Migration:** hand-authored via `prisma migrate diff … --script` then
`migrate deploy` (per the project's migration convention — never `migrate dev`).
Adds two `deals` columns, the new tables, and the curated read index. No
`feed_tier` backfill is needed (the tier is derived at read time).

## 3. Crawler subsystem — new `src/crawler/`

Per-source pipeline, structured to mirror `src/ingestion/`:

1. **Fetch** (`source-fetcher.ts`) — HTTP GET with a descriptive User-Agent,
   `robots.txt` respect, request timeout, and a response size cap. Transient
   failures recorded as `CrawlFailure`, never thrown past the run.
2. **Extract** (hybrid) → `DealCandidate[]` with per-field confidence:
   - `StructuredExtractor` — JSON-LD (`Offer`, `FoodEstablishment`, `Restaurant`),
     microdata/RDFa, and regex for prices (`$\d+`) and happy-hour windows
     (`/happy hour\s*\d/i`, time ranges). Deterministic, fully unit-tested.
   - `LlmExtractor` — Claude with a forced StructuredOutput schema, invoked ONLY
     when `StructuredExtractor` yields nothing. Uses the latest Claude model.
     Behind a `DealExtractor` interface so the client is mockable in tests.
3. **Geocode** (`geocoder.ts`) — `Geocoder` interface; `NominatimGeocoder`
   default (1 req/s, key-less), `MapboxGeocoder` when `GEOCODER_KEY` is set.
   Returns lat/lng + a geocode confidence; low confidence flags the candidate.
4. **Normalize** (`candidate.mapper.ts`) — `DealCandidate` → existing
   `NormalizedDeal`, with `sourceTrust='editorial'`, plus computed `confidenceScore`.
5. **Queue** — upsert a `Deal` with `status='draft'`,
   `moderationStatus='pending'`, `sourceTrust='editorial'`,
   `crawlSourceId=<source>`. Dedup via the existing `fingerprint`. Because feed
   queries require `status='published'`, draft candidates are never served. The
   deal's derived tier is `community` while pending and becomes `curated` the
   moment a moderator approves it (editorial + approved + published).

`CrawlerModule` registers a `CrawlerService` (orchestrates a run over one/all
enabled `CrawlSource` rows) and a `crawl-cli.ts` exposing `pnpm crawl <slug|all>`.

**`confidenceScore` (0–100)** — pure function of: extraction path (structured
> llm), required-field completeness (title/merchant/category/dates/address),
geocode confidence, and date validity (start < expiry, expiry in future).
Surfaced to moderators to triage the queue.

### Production gating (intentional difference from EditorialProvider)

The existing fixture/editorial *demo* providers are registered only when
`fixturesEnabled()` (so `pnpm ingest editorial` fails in prod). The crawler is a
**production-intended** editorial source: it runs in production, but every output
is `status=draft` + `moderationStatus=pending` and can only reach the feed via
human approval. The mandatory moderation gate is what makes serving CURATED in
production safe. The crawler does NOT touch the verification/coverage paths.

## 4. Moderation workflow — extend `src/admin/`

Reuse `ModerationStatus` (`pending | approved | rejected`) and `AuditService`.
New `ModerationService` + endpoints on the admin controller (all `@Roles(admin)`):

- `GET /v1/admin/moderation/queue` — `pending` curated candidates, ordered by
  `confidenceScore` desc, with extracted provenance (`sourceUrl`, `crawlSourceId`,
  geocode flag). Filters: source, category, zone.
- `POST /v1/admin/moderation/:id/approve` → `status=published`,
  `moderationStatus=approved`, reindex (search), audit `deal.moderate.approve`.
- `POST /v1/admin/moderation/:id/reject` → `status=archived`,
  `moderationStatus=rejected`, audit with `{ reason }`.
- `POST /v1/admin/moderation/:id/edit` → patch a bounded field set
  (`title, merchant, categoryId, address→lat/lng, startAt, expiresAt`), audit a
  before/after diff. Lets moderators fix bad geocodes/titles before approving.
- `expire` → reuse existing `POST /v1/admin/deals/:id/expire`.

Curated deals never auto-publish. Approve is the only path to the feed.

## 5. Feed ranking + blending — the never-empty ladder

Rework `FeedsService.nearby()` in `src/feeds/feeds.service.ts`. The coverage gate
stops zeroing the feed and instead becomes a quality signal carried in the
response. Assemble a page by walking steps until the page target (`limit`) is met:

1. **VERIFIED in radius** — `authoritative` + `verified` + physical + in radius
   (current behavior, unchanged query).
2. Insufficient → **expand radius** for VERIFIED only: 10 → 25 → 50 mi (capped).
3. Still insufficient → **blend CURATED**: `sourceTrust='editorial'` +
   `status='published'` + `moderationStatus='approved'` + physical + in (expanded)
   radius (these conditions are exactly what `deriveFeedTier` maps to `curated`).
4. Still insufficient → **blend online** verified inventory (the Anywhere pool),
   labeled as online.
5. **COMMUNITY** — reserved no-op (no inventory in v1).

**Ordering:** a `feed_tier` rank computed in SQL via `CASE` (verified=0 <
curated=1 < community=2 — mirroring `deriveFeedTier`), then the existing
distance+freshness `sort_key`. **Cursor:** composite `tierRank:sortKey:id`
(base64url) so keyset pagination stays stable across the blended set.

**Honesty preservation:** the response still returns the `coverage` object so the
client can truthfully explain *why* it is blending (e.g. "verified inventory is
thin here — showing curated + online"). The "Verified" badge remains
authoritative-only; CURATED/COMMUNITY cards are badged as such. This satisfies
"never empty" without claiming anything is verified that isn't.

> **Behavioral change:** this reverses the post-review hard gate where Nearby
> returned 0 deals outside a qualified zone. Confirmed in brainstorm via the
> "tiered, badge-honest blend" choice. Honesty now lives in the badges + coverage
> signal rather than in an empty feed.

The `online()` (Anywhere) feed is unchanged except it may be reused as the step-4
blend source.

## 6. Ops + testing

- **CLI/cron:** `pnpm crawl <slug|all>`; scheduled via the existing queue
  (`deals-queue.ts` / `jobs.ts`) per `crawlIntervalHours`.
- **Config:** add optional `GEOCODER_KEY` (+ provider select) to `env.schema.ts`.
- **Tests** (reuse the colima/Docker DB harness):
  - `StructuredExtractor` — JSON-LD / microdata / regex fixture pages.
  - `LlmExtractor` — mocked Claude client, schema-conformance.
  - `Geocoder` — fake implementation; Nominatim mapper unit test.
  - `confidenceScore` — pure-function table tests.
  - `ModerationService` — approve/reject/edit transitions + audit assertions.
  - Feed blend — verified-sufficient (no blend), thin-verified (radius expand),
    zero-verified (curated + online blend), and the **never-empty guarantee**.

## Implementation phases (single spec, phased plan)

1. **Data model** — enum, columns, new models, hand-authored migration + backfill.
2. **Crawler** — fetch → extract (hybrid) → geocode → normalize → queue + CLI + run records.
3. **Moderation** — `ModerationService` + admin endpoints + audit.
4. **Feed blend** — tiered never-empty ladder in `FeedsService` + cursor + coverage signal.

Each phase is independently testable and lands behind the moderation gate, so no
unverified inventory can reach users mid-rollout.

## Out of scope (v1)

- COMMUNITY ingest path (user-submitted deals, abuse controls) — reserved only.
- iOS client changes for tier badges / blend banner (separate frontend spec).
- Per-merchant crawler adapters (the hybrid extractor is source-agnostic by design).
