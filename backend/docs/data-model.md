# Data Model

Authoritative store: **PostgreSQL + PostGIS** (Prisma schema in `prisma/schema.prisma`;
migrations in `prisma/migrations/`). Meilisearch is a derived index. Money is
`BIGINT` minor units. `geog` on `deals` is a STORED generated `geography(Point,4326)`
column with a GiST index (raw-SQL managed; see `decisions.md` ADR-003).

## Tables by domain
- **Identity / prefs:** `users` (↔ Supabase `sub`), `user_profiles`, `user_preferences`, `user_category_preferences`, `user_roles` (server-controlled).
- **Catalog:** `schools`, `campuses` (lat/lng + radius), `categories` (slug = iOS `DealCategory`), `coverage_zones` (density-first rollout: lat/lng + radius + `enabled`), `stores`, `deals` (money minor units, status/moderation enums, `geog`, `fingerprint`, `external_id`, **`source_trust` enum {authoritative,editorial,fixture} — only `authoritative` is ever verified/badged/counted/served; server-controlled verification: `verification_status` enum {pending,verified,unreachable,invalid,expired} + `last_verified_at`, `last_verification_attempt_at`, `verification_failure_reason`; provenance `source`, `source_url`, `provider_attribution`**; **crawler columns: `confidence_score` INTEGER (0–100, nullable — only set for crawled deals, null for hand-curated/fixture/authoritative ingestion), `crawl_source_id` UUID FK → `crawl_sources` (nullable)**).
- **Actions:** `saved_deals`, `watched_deals`, `deal_swipes` (soft-undo), `deal_redemptions` (counted-once), `deal_interactions` (view/click/share/**impression/open**, coordinate-free `metadata` JSON + `dedupe_key` for one-per-day dedup), `idempotency_keys`.
- **Search:** derived Meilisearch `deals` index (not a table).
- **Ingestion / verification:** `ingestion_runs`, `ingestion_failures`, `verification_runs`, `verification_outcomes` (daily re-verification observability).
- **Curated crawler:** `crawl_sources` (seed URL registry: `url`, `kind` enum {restaurant,happy_hour,student_discount,grocery_circular,local_promo}, `merchant_hint`, `default_category_slug`, `zone_slug`, `enabled`, `crawl_interval_hours`, `last_crawled_at`), `crawl_runs` (per-source run log: `status` reuses `ingestion_status`, counters `fetched`/`queued`/`deduped`/`failed`, `error`, `started_at`/`finished_at`), `crawl_failures` (per-candidate failure rows linking to `crawl_runs` with `url` + `reason`).
- **Notifications:** `push_tokens`, `notification_preferences`, `notifications` (dedupe-keyed), `price_history`.
- **Subscriptions / admin:** `subscriptions`, `subscription_events` (idempotent), `audit_logs`.
- _(Phase 9b, not yet built: `business_accounts`, `business_members`, `sponsored_campaigns`, `sponsored_impressions`.)_

## Derived `feed_tier`

`feed_tier` is **NOT a stored column**. It is computed at query time (and in application code via `deriveFeedTier()`) from four existing fields: `source_trust`, `verification_status`, `moderation_status`, and `is_online`. This ensures it can never drift out of sync with the underlying provenance data.

**Tier ranking (lower = higher priority in feed ordering):**

| Rank | Tier | Rule |
|---|---|---|
| 0 | **verified** | `source_trust='authoritative'` AND `verification_status='verified'` AND `is_online=false` (physical confirmed deals) |
| 1 | **curated** | `source_trust='editorial'` AND `moderation_status='approved'` AND `status='published'` (crawler deals approved by a moderator) |
| 2 | **online** | `source_trust='authoritative'` AND `verification_status='verified'` AND `is_online=true` (verified online/affiliate deals) |
| 3 | **community** | everything else (reserved fallback; no ingest path yet) |

The SQL equivalent (`FEED_TIER_CASE_SQL`) is inlined into `ORDER BY` / `SELECT` in feed queries. The TypeScript function `deriveFeedTier()` maps the same logic for DTO construction. The "Verified" badge surfaced to users always implies tier 0 (authoritative + verified); tier 1 (curated) carries a distinct "Curated" badge.

## Verified-inventory pilot (Atlanta)
- **Trust:** only `source_trust='authoritative'` providers (e.g. Ticketmaster) yield verified, badged, coverage-counting, feed-served inventory. The demo `editorial` (hand-curated food/grocery fixture) and `fixture` (dev/seed) inventory ingest as `pending` and their providers are only registered/cron-scheduled when fixtures are enabled (off in production). A Verified status therefore always reflects real authoritative source confirmation. Crawler-produced `editorial`-trust deals are **production-intended** and distinct from the fixture/demo editorial providers — they enter moderation and, once approved, are served as CURATED tier.
- **Nearby feed** returns a blended, tier-ranked page: VERIFIED (physical, rank 0) → CURATED (moderator-approved crawler deals, rank 1) → ONLINE fallback (verified authoritative online deals, rank 2). The feed is **never empty**: if physical inventory (verified+curated) doesn't fill the page, verified online deals are appended. A radius expansion ladder (base → max(base,25mi) → max(base,50mi)) is attempted before the online fallback. The `coverage` signal is still returned in the API response as an honesty indicator but no longer hard-gates the feed. **Anywhere** = authoritative verified `is_online=true`. The `verified` flag is server-derived on `DealDto`; never read from clients.
- **Density-first gate:** `FeedsService.nearby` serves deals ONLY when the user's point is inside an `enabled` `coverage_zones` row that currently meets the threshold; otherwise it returns a machine-readable `coverage` status (`outside_coverage`/`low_coverage`) and zero deals (the client shows an honest low-coverage state + Anywhere). `CoverageService.coverageForPoint` is the shared source of truth for the gate and `GET /v1/admin/coverage`.
- **Daily re-verification** (`verify` BullMQ job → `VerificationService`) re-checks every active AUTHORITATIVE deal via the provider's `verify()`: confirmed→refresh `last_verified_at` (+ persist a valid future provider expiry); invalid→archive immediately; expired→expire immediately; transient `unreachable`→kept only within a ~36h grace window, then dropped. Runs are finalized `failed` on error (no abandoned `running`); providers + per-deal writes are isolated.
- **Coverage** threshold: a zone qualifies at ≥20 authoritative-verified, pilot-category (`food`/`groceries`/`entertainment`), physical deals within 10mi. Online/expired/duplicate/unverified/editorial/fixture never count. Re-ingesting a record never slides its expiration (resolved once at first ingest).

## Key indexes (why)
- `deals (status, expires_at)` — feed/search filters. `deals (status, verification_status, expires_at)` + `deals (verification_status, expires_at)` — verified-feed gating + re-verification sweeps. `deals USING GIST (geog)` — `ST_DWithin` nearby. `deals (fingerprint)` — dedup. `deals (category_id)`.
- `saved_deals (user_id, saved_at)`, `deal_swipes (user_id, created_at)`, `deal_interactions (deal_id, type)` — per-user lists + popularity.
- Unique: `deals.external_id`, `subscriptions.original_transaction_id`, `notifications (user_id, dedupe_key)`, `deal_interactions (user_id, dedupe_key)`, `push_tokens.token`, `user_roles (user_id, role)`, `(user_id, deal_id)` PKs on saves/watches/redemptions.

## Swift ↔ DB mapping
See `architecture.md` §3. The API `DealDto` (and committed `openapi.json`) is the iOS contract.
