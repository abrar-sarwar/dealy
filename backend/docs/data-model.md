# Data Model

Authoritative store: **PostgreSQL + PostGIS** (Prisma schema in `prisma/schema.prisma`;
migrations in `prisma/migrations/`). Meilisearch is a derived index. Money is
`BIGINT` minor units. `geog` on `deals` is a STORED generated `geography(Point,4326)`
column with a GiST index (raw-SQL managed; see `decisions.md` ADR-003).

## Tables by domain
- **Identity / prefs:** `users` (↔ Supabase `sub`), `user_profiles`, `user_preferences`, `user_category_preferences`, `user_roles` (server-controlled).
- **Catalog:** `schools`, `campuses` (lat/lng + radius), `categories` (slug = iOS `DealCategory`), `stores`, `deals` (money minor units, status/moderation enums, `geog`, `fingerprint`, `external_id`).
- **Actions:** `saved_deals`, `watched_deals`, `deal_swipes` (soft-undo), `deal_redemptions` (counted-once), `deal_interactions` (view/click/share), `idempotency_keys`.
- **Search:** derived Meilisearch `deals` index (not a table).
- **Ingestion:** `ingestion_runs`, `ingestion_failures`.
- **Notifications:** `push_tokens`, `notification_preferences`, `notifications` (dedupe-keyed), `price_history`.
- **Subscriptions / admin:** `subscriptions`, `subscription_events` (idempotent), `audit_logs`.
- _(Phase 9b, not yet built: `business_accounts`, `business_members`, `sponsored_campaigns`, `sponsored_impressions`.)_

## Key indexes (why)
- `deals (status, expires_at)` — feed/search filters. `deals USING GIST (geog)` — `ST_DWithin` nearby. `deals (fingerprint)` — dedup. `deals (category_id)`.
- `saved_deals (user_id, saved_at)`, `deal_swipes (user_id, created_at)`, `deal_interactions (deal_id, type)` — per-user lists + popularity.
- Unique: `deals.external_id`, `subscriptions.original_transaction_id`, `notifications (user_id, dedupe_key)`, `push_tokens.token`, `user_roles (user_id, role)`, `(user_id, deal_id)` PKs on saves/watches/redemptions.

## Swift ↔ DB mapping
See `architecture.md` §3. The API `DealDto` (and committed `openapi.json`) is the iOS contract.
