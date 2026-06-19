# Progress Log

Append-only record of phases. Each phase records: work, files, commands, results, limitations, next.

---

## Phase 0 — Discovery & design ✅ (docs)
**Work:** Inspected iOS repo (models, services, AppState, views, tests, README, git). Mapped Swift domain → backend tables. Chose modular-monolith architecture. Wrote `architecture.md`, `decisions.md`, `providers.md`, this log.
**Environment found:** Node v25.9.0, npm 11, pnpm 10.33; Docker CLI 29.4 with **colima** daemon (started, healthy); Supabase CLI present; no `psql`/`railway` CLI. iOS: Xcode 26.5, sim iPhone 17 Pro, bundle `com.dealy.app`.
**Key constraints recorded:** most "deal" sources have no usable API (see `providers.md`); all external creds absent → interface + local adapter pattern; Node v25 is non-LTS (engines pinned to >=20).
**Preserved:** all uncommitted iOS work (icon/deal-size/map/startup changes) — backend is isolated in `/backend`.
**Next:** Phase 1 backend foundation.

---

## Phase 1 — Backend foundation ✅ (verified)
**Work:** Scaffolded NestJS 11 (Fastify) + strict TypeScript; zod-validated config (fail-fast, production-required keys); global Prisma module/service; health module (`/health/live`, `/health`, `/health/ready` with real DB ping); pino structured logging with secret redaction; Swagger/OpenAPI at `/docs`; URI versioning (`/v1`, health version-neutral); helmet + CORS + graceful shutdown; separate `worker.main.ts` process entrypoint; Docker Compose (PostGIS 16-3.4, Redis, Meilisearch); production multi-stage `Dockerfile` + `.dockerignore`; `.env.example`; ESLint(flat)+Prettier; Jest + env-validation unit tests; GitHub Actions CI (`backend-ci.yml`: install→generate→lint→typecheck→build→migrate deploy→test, + gitleaks).

**Files added:** `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `nest-cli.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`, `.dockerignore`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `jest.config.js`, `prisma/schema.prisma`, `prisma/migrations/20260619052109_init/migration.sql`, `src/main.ts`, `src/worker.main.ts`, `src/app.module.ts`, `src/config/{env.schema,config.module}.ts`, `src/config/env.schema.spec.ts`, `src/prisma/{prisma.service,prisma.module}.ts`, `src/health/{health.controller,health.service,health.module}.ts`, `.github/workflows/backend-ci.yml`.

**Commands + results (all on this machine):**
- `pnpm install` → ok; lockfile committed; build scripts allowlisted via `pnpm.onlyBuiltDependencies`.
- `docker compose up -d` → postgres(PostGIS 3.4)/redis/meilisearch all **healthy** (host ports 5434/6381/7700 to avoid clashes with other local stacks).
- `prisma migrate deploy` → init migration applied; `health_checks` table created; PostGIS verified (`postgis_version()` = 3.4).
- `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm build` ✅ · `pnpm test` ✅ **6/6**.
- Runtime smoke: `node dist/main.js` → boots, Prisma connects; `GET /health/live` → `200 {"status":"ok"}`; `GET /health/ready` → `200 {"status":"ok","checks":[{"name":"database","status":"up"}]}`; `/docs-json` serves OpenAPI.

**Limitations / notes:** Node v25.9 locally (CI pinned to Node 22 LTS; `engines: >=20.11`). PostGIS image is amd64 (runs under colima emulation locally; CI/Railway use native). Redis/Meilisearch health indicators are wired into compose but their NestJS health checks are added with their modules (Phases 5–7). No external credentials needed yet.

**Next:** Phase 2.

---

## Phase 2 — Auth + user vertical slice ✅ (backend verified; iOS client pending)
**Decision:** local-adapter approach (user-chosen) — Supabase JWT verification implemented against a JWKS resolver; verified locally with a generated RSA keypair + `createLocalJWKSet`. Real Supabase = set `SUPABASE_JWKS_URL`/`SUPABASE_URL` + keys (no code change).

**Work:**
- **Schema/migration** (`20260619053522_auth_users`): `users`, `user_roles` (server-controlled `UserRole` enum — NOT from JWT), `user_profiles`, `user_preferences`, `user_category_preferences`, `categories`, `schools`, `campuses`. Seeded 10 categories (mirror iOS `DealCategory`), 4 GA schools, 5 campuses (GSU/GT/KSU/UGA + metro Atlanta) with coordinates.
- **Auth:** `JwtVerifierService` (jose, RS256/ES256 via JWKS, enforces audience + issuer-when-configured, fails closed); `jwksResolverProvider` (remote in prod / overridable in tests); global `AuthGuard` (`@Public()` opt-out) + `RolesGuard` (`@Roles()`); `@CurrentUser()`; `UserSyncService` (idempotent upsert by Supabase `sub`, rejects soft-deleted accounts).
- **Endpoints:** `GET/PATCH/DELETE /v1/me`, `GET/PUT /v1/me/preferences`, public `GET /v1/schools|campuses|categories`. Global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform), shared via `app.setup.ts`.
- jose pinned to **v5** (v6 is ESM-only → breaks Jest/CJS); documented.

**Commands + results:**
- `pnpm seed` → `10 categories, 4 schools, 5 campuses`.
- `prisma migrate deploy` → `auth_users` migration applied.
- `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm build` ✅.
- `pnpm test` ✅ **11/11** (env validation + JWT verify: valid / tampered / wrong-aud / expired / unconfigured-503).
- `pnpm test:e2e` ✅ **8/8** (no-token→401, public reference ok, user create+idempotent, **ownership isolation** between tokens, prefs update + range 400, interests+onboarding + unknown-slug 400, **forbidNonWhitelisted** 400, **account soft-delete then token rejected** 401). CI now runs migrate→seed→test→test:e2e.

**Limitations / next:** **iOS auth client not yet wired** (API client + token provider + remote services) — pairs naturally with Phase 3's `RemoteDealService`, and real sign-in needs a Supabase project (publishable key + Auth SDK), consistent with the deferred-Supabase choice. RLS policies (defense-in-depth) to be added when the real Supabase DB is connected. Roles currently assigned only via DB; admin role-grant endpoint comes in Phase 9.

**Next:** Phase 3.

---

## Phase 3 — Core deals + feeds (PostGIS) 🚧 (code complete; PostGIS verified; seed/e2e pending stable local DB)
**Work:**
- **Schema/migration** (`20260619060424_deals`): `stores`, `deals` (money as `BIGINT` minor units; `status`/`moderation_status` enums; `external_id` for idempotent upsert/dedupe). **`geog` is a STORED generated `geography(Point,4326)` column** derived from lat/lng (hand-authored in the migration since Prisma can't author generated/geography columns), with a **GiST index**. Typed `Unsupported(...)` in Prisma so it's tracked without false drift; all spatial queries use raw SQL.
- **Feeds:** `GET /v1/feeds/nearby` (public) — raw PostGIS `ST_DWithin` (GiST-indexed) + `ST_Distance`, distance-sorted, **cursor pagination** (opaque base64 of distance+id), optional category filter, excludes online (no-geog) deals.
- **Deals:** `GET /v1/deals/:id` (public) detail. Shared `deal.mapper.ts` (minor units → dollars; computes savings; ISO dates) → a `DealDto` that maps 1:1 to a forthcoming iOS `DealDTO`.
- **Seed:** ~30 deals scattered around the 5 campuses (idempotent by `externalId`) + 3 online deals.

**Verified:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm build` ✅ · `pnpm test` ✅ **11/11**. PostGIS layer proven: migration applied, the generated `geog` column auto-populated (`POINT(-84.3857 33.7531)` from lat/lng), GiST index created.

**DB environment (resolved):** The amd64 `postgis/postgis` image was unstable under colima qemu emulation (containers wedged `unhealthy`). **Switched `docker-compose` to the arm64-native `ghcr.io/baosystems/postgis:16-3.4`** → healthy in ~9s, fully stable. All migrations apply; `pnpm seed` → 33 deals. **`pnpm test:e2e` 14/14 green** locally: `test/deals-feeds.e2e-spec.ts` (nearby radius, ascending-distance order, cursor no-overlap, category filter, detail 200 / missing 404, invalid-lat 400) + auth suite. So **Phase 3 is now fully verified locally**, not just CI.

**Migration gotcha:** `prisma migrate diff --from-schema-datasource` re-emits a `DROP INDEX deals_geog_idx` + `ALTER COLUMN geog DROP DEFAULT` on every new migration (Prisma can't represent the hand-authored GiST index / generated column). **Strip those two lines** from each generated migration before `migrate deploy` (documented in the memory + decisions).

**iOS client (Phase 3 second half) ✅ built + tested:** Added `Dealy/Services/API/` — `APIConfig` (local/staging/production via `DEALY_API_ENV`, default prod `https://api.dealy.app`; `DealQuery`), `APIClient` (async URLSession, bearer-token hook for Supabase, ISO-8601 fractional-second date decoding, typed `APIError`), `DealDTO` (Codable, separate from domain `Deal`, `toDeal()` mapping), `RemoteDealService` (conforms to existing `DealServicing` → drop-in for `MockDealService` via `AppState(dealService: RemoteDealService())`). **Mock is retained** for previews/tests/offline; the app's default composition is unchanged (still mock) so behavior is identical until a backend URL is configured. Verified: `xcodegen generate` + **iOS BUILD SUCCEEDED** (with the user's concurrent UI edits), and `DealDTOMappingTests` **2/2 pass** (decode + map, unknown-category fallback).

**Honest end-to-end status:** the live slice (app → API → PostGIS → app) is wired on both sides but **not yet exercised together** because (a) the local DB is blocked as above and (b) no backend is deployed. It will run once a stable DB + deployed API exist (Phase 10), or in CI for the backend half.

---

## Phase 4 — User actions ✅ (verified locally)
**Work:** schema/migration (`user_actions`) — `saved_deals`, `watched_deals`, `deal_swipes` (soft-undo), `deal_redemptions` (counted once per user+deal = iOS `savingsEvents`), `deal_interactions` (view/click/share), `idempotency_keys`. `ActionsModule`:
- `POST /v1/deals/:id/swipes` (right also saves; **Idempotency-Key** header → safe retries), `DELETE /v1/deals/:id/swipes/latest` (undo restores prior saved state), `POST/DELETE :id/save`, `:id/watch`, `POST :id/{views,clicks,shares}`, `POST :id/redemptions` (realized savings, deduped), `GET /v1/me/{saved,watched}-deals`.
- All routes auth-required, ownership-scoped to `req.authUser.id` (no id tampering surface). Saves/watches/redemptions idempotent via composite PKs; swipes append-only with `withIdempotency` helper (DB-backed; Redis hardening later).

**Verified:** `lint` ✅ · `typecheck` ✅ · `build` ✅ · `pnpm test` **11/11** · **`pnpm test:e2e` 22/22** (3 suites). Actions suite proves: unauth→401, swipe-right-saves + appears in saved-deals, **idempotency** (same swipeId, exactly one swipe row), **undo** restores state, save/watch idempotent, **redemption counted once**, **ownership** (user B can't see user A's saves), interaction 201. CI runs all of this on its native PostGIS service.

**Next:** Phase 5.

---

## Phase 5 — Search (Meilisearch) ✅ (verified locally)
**Work:** `SearchModule` — `meiliClientProvider` (null when unconfigured), `SearchIndexer` (index settings: searchable/filterable/sortable attrs; `reindexAll`, incremental `upsertDeals`/`removeDeal`; waits on Meili tasks), `SearchService` (Meili primary → **Postgres ILIKE fallback** when Meili is down/unconfigured, so search never hard-fails), `GET /v1/search` (public). Query DTO validates + guards against filter injection (`category` must be `^[a-zA-Z]+$`). `pnpm search:reindex` CLI. Docker image stays the source of truth; Postgres authoritative, Meili derived.
- Filters: q (full-text), category, online, student, minDiscount, maxPrice. Sorts: relevance/newest/savings/priceLow/endingSoon.

**Verified:** `lint` ✅ · `typecheck` ✅ · `build` ✅ · `pnpm search:reindex` → indexed **33 deals** · `pnpm test` **11/11** · **`pnpm test:e2e` 28/28** (4 suites). Search suite proves full-text ("pizza"), **typo tolerance** ("pizzza"→pizza), category + online filters, price-ascending sort, and **400 on injection-style category**. CI gained a Meilisearch service + readiness wait + reindex step.

**Next:** Phase 6.

---

## Phase 6 — Ingestion + BullMQ worker ✅ (verified locally)
**Work:** schema/migration (`ingestion`) — `ingestion_runs`, `ingestion_failures`, `Deal.fingerprint` (+ index). `IngestionModule`:
- **Provider framework:** `DealProvider` interface (`isAvailable`/`fetch`), `NormalizedDeal`, `dealFingerprint` (merchant+title+location+price+category — never title alone), `validateNormalizedDeal`. `ProviderRegistry`.
- **Providers:** `FixtureProvider` (deterministic, always available — dev/tests) and **`TicketmasterProvider`** (real Discovery API, mapped events→deals, **credential-gated** via `TICKETMASTER_API_KEY` → "awaiting credentials"; implemented, not yet run against live API).
- **`IngestionService.run(provider)`:** fetch→validate→dedupe (in-run + cross-source by fingerprint)→upsert (idempotent by `externalId`)→incremental **search index**→records `ingestion_runs` + per-record `ingestion_failures`. `expireDeals()` sweep.
- **BullMQ:** `deals` queue + worker (`worker.main.ts`) processing `ingest`/`expire`/`reindex` jobs + repeatable cron (ingest 6-hourly, expire hourly). `pnpm ingest [provider]` CLI. Postgres stays authoritative; indexing never blocks the run.

**Verified:** `lint`/`typecheck`/`build` ✅ · `pnpm ingest fixture` → `upserted=5` · `pnpm test` **15/15** (added fingerprint determinism + validation specs) · **`pnpm test:e2e` 34/34** (6 suites). Ingestion suite: fixture ingest + run record, idempotent re-run, **unavailable-provider→failed (awaiting credentials)**, unknown-provider throws, expire sweep. **BullMQ suite: enqueue→worker→ingestion** end-to-end against Redis. e2e now runs serially (`maxWorkers:1`) since suites share one DB. CI gained a Redis service + reindex.

**Next:** Phase 7.

---

## Phase 7 — Notifications + price tracking ✅ (verified locally)
**Work:** schema/migration (`notifications`) — `push_tokens`, `notification_preferences` (7 granular toggles + quiet hours + timezone), `notifications` (dedupe-keyed), `price_history`. `NotificationsModule`:
- **PushSender abstraction:** `FcmPushSender` (real FCM HTTP v1 + service-account OAuth via jose; **credential-gated** → awaiting `FIREBASE_*`; APNs flows through Firebase) and `LocalPushSender` (dev/tests). Selector uses FCM when configured, else local.
- **Push tokens:** register/rotate (upsert by token, clears `invalid`), ownership-scoped delete, multiple devices/user.
- **Notifications:** `createAndSend` (respects per-type prefs + **quiet hours** + **dedupeKey**), deliver to valid tokens, **invalid-token cleanup**, list, mark-read. Endpoints `POST/DELETE /v1/push-tokens`, `GET /v1/notifications`, `PATCH /v1/notifications/:id/read`, `GET/PUT /v1/me/notification-preferences`.
- **Price tracking:** `PriceTrackingService` records `price_history` and fires **price-drop** alerts to watchers/savers; wired into ingestion upsert. **Expiring-saved sweep** as a BullMQ `notify-expiring` job (+ daily cron).

**Verified:** `lint`/`typecheck`/`build` ✅ · `pnpm test` **15/15** · **`pnpm test:e2e` 44/44** (7 suites). Notifications suite: token register+rotate, prefs get/update, create+deliver+list+read, **disabled-pref→null**, **dedupe**, **invalid-token cleanup**, **quiet-hours (recorded, not pushed)**, **price-drop→watcher**, **expiring sweep**, ownership isolation.

**Next:** Phase 8.

---

## Phase 8 — Recommendations + analytics ✅ (verified locally)
**Work:**
- **Recommendations:** `GET /v1/feeds/recommended` (auth) — deterministic, **explainable** weighted scoring (category-match .30, proximity .20, discount .15, freshness .10, popularity .10, urgency .10, dealScore .05) via a PostGIS candidate query that **excludes already-swiped** deals; returns `{ score, reasons[] }` per deal ("Matches your Food interest", "Near Georgia State", "40% off", "Ending soon", "Popular nearby"). `GET /v1/feeds/trending` (public) by recent popularity.
- **Analytics:** typed `DealyEvent` taxonomy, `AnalyticsService` → PostHog (gated; no-op when unconfigured) with **PII/secret sanitization** (drops tokens/email/coords/over-long values), `POST /v1/events` (auth, distinctId = user) with event-enum validation, server emit on redeem (`deal_redeemed`).
- **Observability:** Sentry init (gated by `SENTRY_DSN`) + **global `AllExceptionsFilter`** → uniform `{ error: { code, message, requestId, statusCode } }`; 5xx logged + sent to Sentry and never leak internals.
- **Contract sync:** added `publishedAt` (= deal createdAt) to `DealDto` + all mappers (Prisma/nearby/search) to match the iOS `DealDTO` field the app added.

**Verified:** `lint`/`typecheck`/`build` ✅ · `pnpm test` **15/15** · **`pnpm test:e2e` 50/50** (8 suites). Recommendations suite: auth-required, score-sorted + non-empty reasons + food-interest reason, **excludes swiped**, trending public, events 202/400/401, **error-envelope shape**.

**Next:** Phase 9.

---

## Phase 9a — Subscriptions + admin ✅ (verified locally)
**Work:** schema/migration (`subscriptions`) — `subscriptions`, `subscription_events` (idempotent), `audit_logs`.
- **Subscriptions (Dealy+):** `AppStoreVerifier` abstraction + `AppleJwsVerifier` (verifies x5c-signed JWS via leaf cert; **chain-pinning to Apple root is the remaining hardening; awaiting real Apple transactions**). `SubscriptionsService` — `syncTransaction` (verify → upsert by `originalTransactionId` → idempotent event), App Store Server **webhook** (`POST /v1/webhooks/apple`, renew/expire/refund/revoke), and `GET /v1/me/entitlements` **computed server-side from the verified row — never a client boolean**. `POST /v1/subscriptions/apple/sync`.
- **Admin:** `@Roles(admin)` controller (RolesGuard from Phase 2, roles from the server table) — grant role, publish/unpublish/expire deal (keeps search index consistent), list ingestion failures, list audit logs. `AuditService` records every privileged action. `pnpm grant-admin <supabaseUserId>` bootstrap CLI.

**Verified:** `lint`/`typecheck`/`build` ✅ · `pnpm test` **15/15** · **`pnpm test:e2e` 60/60** (10 suites). Subscriptions suite: auth-required, no-entitlement→sync active→**Dealy+ true**, **idempotent** (1 event), **EXPIRED webhook revokes**, expired-tx never grants. Admin suite: **non-admin 403**, admin (server role) 200, **grant role + audit log**, **unpublish/publish deal + audit**.

**Remaining Phase 9b (not yet built):** business accounts + members, sponsored campaigns/impressions/clicks + budget enforcement + viewability + sponsored placement in feed. Noted as the next slice.

**Next:** Phase 10 (jumped here at owner request).

---

## Phase 10 — Deploy + release docs ✅ (docs/config; owner actions gated)
**Work:** `railway.json` (api service: Dockerfile build, `/health/ready` healthcheck, 1 replica). `docs/deployment.md` (Railway 2-service topology + Supabase setup + env + **migrations as a one-off, never racing** + connection pooling + rollback + cost + CI/CD flow). `docs/testflight.md` (full Apple/Firebase owner checklist: enrollment → App ID/capabilities → APNs/FCM → App Store Server API + webhook URL → StoreKit products → archive/upload → TestFlight → submit). `docs/security.md` (threat model + tested behaviors + RLS). `docs/mobile-integration.md`, `docs/data-model.md`. **`docs/openapi.json` exported** (38 paths) via `pnpm openapi:export`.

**Verified:** OpenAPI spec generates (38 paths); all prior suites still green (15 unit / 60 e2e). **Owner-gated (cannot be done from this repo):** provisioning Supabase/Railway/Redis/Meili, Apple Developer enrollment, Firebase project, StoreKit products, custom domain `api.dealy.app`, archive+upload to TestFlight — all documented step-by-step.

**Definition-of-done status:** the backend runs locally; migrations apply; Redis/BullMQ operate; Supabase JWTs validate; nearby PostGIS feed + swipe/save + search + admin + one ingestion provider (fixture) all work and are tested; Docker builds; CI green; deploy + TestFlight documented. Remaining real-world steps need owner credentials.

**Remaining backend work (post-merge):** Phase 9b (business accounts + sponsored campaigns), rate limiting, Apple JWS chain pinning, account-deletion PII purge job, and the full iOS service wiring once a backend is deployed + Supabase Auth is connected.
