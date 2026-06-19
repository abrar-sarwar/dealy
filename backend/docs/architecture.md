# Dealy Backend — Architecture & Current-State Assessment

> Status: living document. Last updated Phase 0.

## 1. Current-state assessment (iOS app, pre-backend)

The repo at `/Users/oninactive/dev/dealy` is a polished **SwiftUI iOS MVP** (iOS 17, XcodeGen, no backend). Key facts the backend must respect:

- **`AppState`** (`Dealy/ViewModels/AppState.swift`) is the single composition root. Dependencies are injected and replaceable:
  - `dealService: DealServicing` — `fetchDeals() async throws -> [Deal]` (currently `MockDealService`).
  - `store: PreferenceStoring` — load/save one `PersistedState` blob (currently `UserDefaultsPreferencesStore`, key `com.dealy.persistedState.v1`).
  - `redemptionHandler: RedemptionHandling`.
- **Placeholder protocols** (`Dealy/Services/Placeholders.swift`) already mark backend seams: `LocationProviding`, `RedemptionHandling`, `NotificationScheduling`.
- **Domain models** are value types: `Deal`, `Campus`, `DealCategory`, `SwipeAction`, `SavingsEvent`, `PersistedState`.
- **Money** is already `Decimal` (good — never floating point).
- **Ranking** is client-side (`DealRanker`) — distance, interests, freshness, discount, expiry, popularity. This becomes a *fallback*; server feeds become authoritative.
- **Persisted user state** today: `hasCompletedOnboarding`, `campusID`, `radius`, `interests`, `savedDealIDs`, `watchedDealIDs`, `swipeHistory`, `savingsEvents`, `notificationsEnabled`.
- Deals carry optional `latitude/longitude` (currently nil — mock). `Campus` has real coordinates. `DealGeo` (added this session) scatters deals around campus deterministically; it **prefers real coords when present**, so real backend coordinates drop in cleanly.

**Implication:** the integration is low-friction. We replace `MockDealService` with a `RemoteDealService`, add a remote-backed `PreferenceStoring` (or a sync layer), and add auth/location/push/subscription services — all behind the existing protocol seams, preserving mock implementations for previews/tests.

### Uncommitted work to preserve
At Phase 0 start, `git status` shows uncommitted iOS changes from prior sessions (icon padding, bigger deals, `DealyGlyph`, `Views/Map/DealsMapView.swift`, `Utilities/DealGeo.swift`, startup redesign, etc.). **The backend lives entirely in `/backend` and must not touch these.**

## 2. Architecture recommendation

**Modular monolith**, two deployable processes, managed backing services.

```
                ┌─────────────────────────────────────────┐
   iOS app ───► │  dealy-api  (NestJS + Fastify, /v1)      │
  (SwiftUI)     │  auth · users · deals · feeds · search   │
                │  actions · notifications · admin · maps  │
                └───────────┬───────────────┬──────────────┘
                            │               │
              enqueue jobs  │               │ read/write
                            ▼               ▼
                ┌───────────────┐   ┌────────────────────────┐
                │ Redis (BullMQ)│   │ PostgreSQL + PostGIS    │
                └──────┬────────┘   │ (Supabase)              │
                       │            └─────────┬──────────────┘
                       ▼                      │ derive
                ┌───────────────┐             ▼
                │ dealy-worker  │      ┌────────────────┐
                │ ingestion ·   │────► │ Meilisearch    │
                │ indexing ·    │      └────────────────┘
                │ notifications │      ┌────────────────┐
                │ price · expire│      │ Supabase Auth  │
                └───────────────┘      │ + Storage      │
                                       └────────────────┘
```

- **`dealy-api`** — public HTTP API. Validates Supabase JWTs, serves user/feed/search/admin endpoints, enqueues async work. No long-running jobs in request path.
- **`dealy-worker`** — BullMQ processors: provider ingestion, search indexing, notification fan-out, price tracking, expiration sweeps, analytics aggregation.
- **Supabase** — Postgres (PostGIS), Auth (JWT issuer), Storage (images).
- **Redis** — BullMQ queues, caching, rate-limit coordination, idempotency keys.
- **Meilisearch** — derived search index (Postgres is authoritative).

**Internal event abstraction** (`DomainEventBus`) decouples producers from BullMQ; BullMQ is the durable execution mechanism. Modules expose narrow public interfaces so `ingestion`, `search`, or `notifications` can later be extracted to their own process without rewrites.

### Why these choices (see `decisions.md` for full ADRs)
Modular monolith over microservices (one team, fast iteration, clear seams); Fastify (throughput, schema-first); Prisma (typed data layer, migrations) with **raw SQL for PostGIS** (Prisma lacks geography ops); Supabase (Postgres+Auth+Storage in one, RLS as defense-in-depth); BullMQ (durable, Redis-native); Meilisearch (typo-tolerant, simple ops vs Elasticsearch); **Apple MapKit on-device** + **Google server-side** geocoding only; **StoreKit 2** for Dealy+ (App Store policy), Stripe only for *business* billing.

## 3. Domain-model mapping (Swift → backend)

| Swift (iOS)                         | Backend table(s)                                  | Notes |
|-------------------------------------|---------------------------------------------------|-------|
| `Deal`                              | `deals` (+ `deal_locations`, `deal_images`, `deal_categories`, `stores`) | money as integer minor units in DB, mapped to `Decimal` in API/DTO |
| `Campus`                            | `schools` + `campuses`                            | seed the 4 GA schools + metro Atlanta; PostGIS `geography(Point)` |
| `DealCategory` (enum)               | `categories`                                      | stable slug = Swift rawValue (`food`, `tech`, …) |
| `PersistedState.hasCompletedOnboarding/campusID/radius/interests` | `user_profiles` + `user_preferences` + `user_category_preferences` | server-authoritative, synced |
| `savedDealIDs`                      | `saved_deals`                                     | ordered (saved_at); idempotent |
| `watchedDealIDs`                    | `watched_deals`                                   | idempotent |
| `swipeHistory` (`SwipeAction`)      | `deal_swipes`                                     | append-only; undo = soft-revert latest |
| `savingsEvents` (`SavingsEvent`)    | `deal_redemptions` (mark-used)                    | dedupe by (user, deal) |
| `notificationsEnabled`             | `notification_preferences`                        | granular per-type later |
| `DealRanker` (client)               | `feeds` module (server scoring) + client fallback | explainable signals preserved |
| `DealServicing.fetchDeals()`        | `GET /v1/feeds/nearby` etc.                        | first endpoint to wire |
| `RedemptionHandling`                | `POST /v1/deals/:id/redemptions` + `Get Deal`     | |
| `NotificationScheduling`            | `notifications` + `push-tokens` modules           | |
| `LocationProviding`                 | Core Location on device; campus fallback          | server never needs raw GPS history |

## 4. Vertical-slice priority

The first end-to-end slice (Phases 1–4) proves the spine: **auth → fetch nearby feed (PostGIS) → swipe/save → persists across sessions/devices**. Search (5), ingestion (6), notifications (7), recs/analytics (8), subs/sponsored (9), deploy (10) layer on after.
