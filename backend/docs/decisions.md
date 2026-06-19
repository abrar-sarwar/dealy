# Architecture Decision Records

Concise ADRs. Each: decision, why, what would change it.

### ADR-001 — Modular monolith, not microservices
**Decision:** One NestJS codebase, two deploy processes (`api`, `worker`), strict module boundaries.
**Why:** Single small team, early product, fast iteration. Network/ops cost of microservices isn't justified by current load. Module interfaces keep extraction cheap later.
**Triggers to revisit:** ingestion or notification volume needs independent scaling/SLAs; team grows past ~1 squad per domain.

### ADR-002 — Fastify adapter over Express
**Decision:** NestJS on Fastify.
**Why:** Higher throughput, schema-based serialization, first-class JSON schema. NestJS supports it natively.
**Triggers to revisit:** a required middleware is Express-only and has no Fastify equivalent.

### ADR-003 — Prisma + raw SQL for geospatial
**Decision:** Prisma as the ORM/migration tool; PostGIS queries via parameterized raw SQL in repositories.
**Why:** Prisma gives typed models + migrations + good DX, but has no native `geography`/`ST_DWithin`. Raw SQL keeps geospatial queries indexed (GiST) instead of in-memory.
**Triggers to revisit:** Prisma ships first-class PostGIS support.

### ADR-004 — Supabase for Postgres + Auth + Storage
**Decision:** Supabase as managed Postgres (PostGIS), JWT auth issuer, and object storage.
**Why:** One vendor for three concerns; RLS gives defense-in-depth even though the API enforces authz; generous startup tier; standard Postgres (portable).
**Triggers to revisit:** need for a DB feature Supabase restricts, or multi-region write needs.
**Security stance:** API uses a privileged server connection; **the iOS app never receives the service-role/secret key**. RLS is enabled on every API-exposed table with ownership policies (not merely `authenticated`). JWTs verified server-side via Supabase JWKS; roles live in server-controlled tables, never user-editable metadata.

### ADR-005 — BullMQ on Redis for async work
**Decision:** Durable jobs via BullMQ; an internal `DomainEventBus` abstracts producers from the queue.
**Why:** Redis already present for caching/rate-limit; BullMQ is mature, supports retries/backoff/DLQ/scheduling.
**Triggers to revisit:** need exactly-once cross-service semantics or event replay → consider a log (Kafka/Redpanda). Not now.

### ADR-006 — Meilisearch as derived index
**Decision:** Postgres authoritative; Meilisearch rebuilt from it via worker jobs.
**Why:** Typo tolerance, fast autocomplete, simple ops vs Elasticsearch/OpenSearch. DB transactions never block on search availability; reindex command + reconciliation included.
**Triggers to revisit:** need vector/semantic search at scale → pgvector or a vector DB.

### ADR-007 — Money as integer minor units in DB
**Decision:** Store money as `BIGINT` minor units (cents) + ISO `currency`. API/DTO expose decimal strings; iOS maps to `Decimal`.
**Why:** No floating-point error; safe arithmetic and aggregation. Matches the app's existing `Decimal` usage.

### ADR-008 — MapKit on device, Google server-side only
**Decision:** iOS uses Core Location (permission/coords) + MapKit (display/pins/directions). Google Maps Platform used **only server-side** for geocoding/Places/address normalization, behind a `MapsProvider` interface, with server-restricted keys.
**Why:** No Google mobile SDK or unrestricted key on device; avoids paying Google for what MapKit does free on-device; keeps a replaceable provider seam. Google Place IDs cached to avoid name-matching and repeat geocoding (respecting Google ToS on caching/attribution).

### ADR-009 — StoreKit 2 for Dealy+; Stripe only for business
**Decision:** Consumer Dealy+ subscription via StoreKit 2 + App Store Server API/Notifications; entitlements verified **server-side** (never trust a client boolean). Stripe reserved for business billing (sponsored campaigns), kept fully separate.
**Why:** Apple requires IAP for consumer digital goods; using Stripe there risks rejection. Server-verified entitlements prevent spoofing.

### ADR-010 — Provider ingestion is interface-first, fixture-backed
**Decision:** A common `DealProvider` contract (fetch→parse→normalize→validate→dedupe→categorize→geocode→images→upsert→expire→report). Ship a deterministic fixture provider first; implement one real *permitted* provider (Ticketmaster Discovery API) before any others. No scraping of sites that prohibit it; no fabricated endpoints.
**Why:** Most "deal" sources (DoorDash, Uber Eats, Walmart, Kroger, universities) have **no public deals API** or prohibit aggregation/scraping. Honesty about availability prevents building illegal/broken integrations. See `providers.md`.

### ADR-011 — API versioning + envelopes
**Decision:** `/v1` prefix; consistent request/response DTOs, error envelope `{ error: { code, message, requestId } }`, cursor pagination for feeds, ISO-8601 dates, decimal-string money.
**Why:** Stable mobile contract; cursor pagination is correct for fast-changing feeds (offset is unstable).
