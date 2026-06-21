# Data Model

Authoritative store: **PostgreSQL + PostGIS** (Prisma schema in `prisma/schema.prisma`;
migrations in `prisma/migrations/`). Meilisearch is a derived index. Money is
`BIGINT` minor units. `geog` on `deals` is a STORED generated `geography(Point,4326)`
column with a GiST index (raw-SQL managed; see `decisions.md` ADR-003).

## Tables by domain
- **Identity / prefs:** `users` (↔ Supabase `sub`), `user_profiles`, `user_preferences`, `user_category_preferences`, `user_roles` (server-controlled).
- **Catalog:** `schools`, `campuses` (lat/lng + radius), `categories` (slug = iOS `DealCategory`), `coverage_zones` (density-first rollout: lat/lng + radius + `enabled`), `stores`, `deals` (money minor units, status/moderation enums, `geog`, `fingerprint`, `external_id`, **`source_trust` enum {authoritative,editorial,fixture} — only `authoritative` is ever verified/badged/counted/served; server-controlled verification: `verification_status` enum {pending,verified,unreachable,invalid,expired} + `last_verified_at`, `last_verification_attempt_at`, `verification_failure_reason`; provenance `source`, `source_url`, `provider_attribution`**).
- **Actions:** `saved_deals`, `watched_deals`, `deal_swipes` (soft-undo), `deal_redemptions` (counted-once), `deal_interactions` (view/click/share/**impression/open**, coordinate-free `metadata` JSON + `dedupe_key` for one-per-day dedup), `idempotency_keys`.
- **Search:** derived Meilisearch `deals` index (not a table).
- **Ingestion / verification:** `ingestion_runs`, `ingestion_failures`, `verification_runs`, `verification_outcomes` (daily re-verification observability).
- **Notifications:** `push_tokens`, `notification_preferences`, `notifications` (dedupe-keyed), `price_history`.
- **Subscriptions / admin:** `subscriptions`, `subscription_events` (idempotent), `audit_logs`.
- _(Phase 9b, not yet built: `business_accounts`, `business_members`, `sponsored_campaigns`, `sponsored_impressions`.)_

## Verified-inventory pilot (Atlanta)
- **Trust:** only `source_trust='authoritative'` providers (e.g. Ticketmaster) yield verified, badged, coverage-counting, feed-served inventory. `editorial` (curated, no-API food/grocery) and `fixture` (dev/seed) inventory ingest as `pending` and never enter trust paths; their providers are only registered/cron-scheduled when fixtures are enabled (off in production). A Verified status therefore always reflects real authoritative source confirmation.
- **Nearby feed** returns only `status=published AND source_trust='authoritative' AND verification_status='verified' AND is_online=false AND expires_at>now()` within radius, ranked by distance + a `created_at`-based freshness term (keyset-stable). **Anywhere** = authoritative verified `is_online=true`. The `verified` flag is server-derived on `DealDto`; never read from clients.
- **Density-first gate:** `FeedsService.nearby` serves deals ONLY when the user's point is inside an `enabled` `coverage_zones` row that currently meets the threshold; otherwise it returns a machine-readable `coverage` status (`outside_coverage`/`low_coverage`) and zero deals (the client shows an honest low-coverage state + Anywhere). `CoverageService.coverageForPoint` is the shared source of truth for the gate and `GET /v1/admin/coverage`.
- **Daily re-verification** (`verify` BullMQ job → `VerificationService`) re-checks every active AUTHORITATIVE deal via the provider's `verify()`: confirmed→refresh `last_verified_at` (+ persist a valid future provider expiry); invalid→archive immediately; expired→expire immediately; transient `unreachable`→kept only within a ~36h grace window, then dropped. Runs are finalized `failed` on error (no abandoned `running`); providers + per-deal writes are isolated.
- **Coverage** threshold: a zone qualifies at ≥20 authoritative-verified, pilot-category (`food`/`groceries`/`entertainment`), physical deals within 10mi. Online/expired/duplicate/unverified/editorial/fixture never count. Re-ingesting a record never slides its expiration (resolved once at first ingest).

## Key indexes (why)
- `deals (status, expires_at)` — feed/search filters. `deals (status, verification_status, expires_at)` + `deals (verification_status, expires_at)` — verified-feed gating + re-verification sweeps. `deals USING GIST (geog)` — `ST_DWithin` nearby. `deals (fingerprint)` — dedup. `deals (category_id)`.
- `saved_deals (user_id, saved_at)`, `deal_swipes (user_id, created_at)`, `deal_interactions (deal_id, type)` — per-user lists + popularity.
- Unique: `deals.external_id`, `subscriptions.original_transaction_id`, `notifications (user_id, dedupe_key)`, `deal_interactions (user_id, dedupe_key)`, `push_tokens.token`, `user_roles (user_id, role)`, `(user_id, deal_id)` PKs on saves/watches/redemptions.

## Swift ↔ DB mapping
See `architecture.md` §3. The API `DealDto` (and committed `openapi.json`) is the iOS contract.
