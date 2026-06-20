# Data Model

Authoritative store: **PostgreSQL + PostGIS** (Prisma schema in `prisma/schema.prisma`;
migrations in `prisma/migrations/`). Meilisearch is a derived index. Money is
`BIGINT` minor units. `geog` on `deals` is a STORED generated `geography(Point,4326)`
column with a GiST index (raw-SQL managed; see `decisions.md` ADR-003).

## Tables by domain
- **Identity / prefs:** `users` (↔ Supabase `sub`), `user_profiles`, `user_preferences`, `user_category_preferences`, `user_roles` (server-controlled).
- **Catalog:** `schools`, `campuses` (lat/lng + radius), `categories` (slug = iOS `DealCategory`), `stores`, `deals` (money minor units, status/moderation enums, `geog`, `fingerprint`, `external_id`, **server-controlled verification: `verification_status` enum {pending,verified,unreachable,invalid,expired} + `last_verified_at`, `last_verification_attempt_at`, `verification_failure_reason`; provenance `source`, `source_url`, `provider_attribution`**).
- **Actions:** `saved_deals`, `watched_deals`, `deal_swipes` (soft-undo), `deal_redemptions` (counted-once), `deal_interactions` (view/click/share/**impression/open**, coordinate-free `metadata` JSON + `dedupe_key` for one-per-day dedup), `idempotency_keys`.
- **Search:** derived Meilisearch `deals` index (not a table).
- **Ingestion / verification:** `ingestion_runs`, `ingestion_failures`, `verification_runs`, `verification_outcomes` (daily re-verification observability).
- **Notifications:** `push_tokens`, `notification_preferences`, `notifications` (dedupe-keyed), `price_history`.
- **Subscriptions / admin:** `subscriptions`, `subscription_events` (idempotent), `audit_logs`.
- _(Phase 9b, not yet built: `business_accounts`, `business_members`, `sponsored_campaigns`, `sponsored_impressions`.)_

## Verified-inventory pilot (Atlanta)
- **Nearby feed** returns only `status=published AND verification_status='verified' AND is_online=false AND expires_at>now()` within radius, ranked by distance + a `created_at`-based freshness term (keyset-stable). **Anywhere** = verified `is_online=true`. The `verified` flag is server-derived and exposed on `DealDto`; it is never read from clients.
- **Daily re-verification** (`verify` BullMQ job → `VerificationService`) re-checks every active deal via each provider's `verify()`: confirmed→refresh `last_verified_at`; invalid→archive immediately; expired→expire immediately; transient `unreachable`→kept only within a ~36h grace window measured from `last_verified_at`, then dropped. Providers are isolated.
- **Coverage** (`CoverageService`, `GET /v1/admin/coverage`, `pnpm coverage`): a zone qualifies at ≥20 verified, pilot-category (`food`/`groceries`/`entertainment`), physical deals within 10mi. Online/expired/duplicate/unverified never count.

## Key indexes (why)
- `deals (status, expires_at)` — feed/search filters. `deals (status, verification_status, expires_at)` + `deals (verification_status, expires_at)` — verified-feed gating + re-verification sweeps. `deals USING GIST (geog)` — `ST_DWithin` nearby. `deals (fingerprint)` — dedup. `deals (category_id)`.
- `saved_deals (user_id, saved_at)`, `deal_swipes (user_id, created_at)`, `deal_interactions (deal_id, type)` — per-user lists + popularity.
- Unique: `deals.external_id`, `subscriptions.original_transaction_id`, `notifications (user_id, dedupe_key)`, `deal_interactions (user_id, dedupe_key)`, `push_tokens.token`, `user_roles (user_id, role)`, `(user_id, deal_id)` PKs on saves/watches/redemptions.

## Swift ↔ DB mapping
See `architecture.md` §3. The API `DealDto` (and committed `openapi.json`) is the iOS contract.
