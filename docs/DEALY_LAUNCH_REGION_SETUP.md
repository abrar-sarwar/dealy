# Dealy Launch Region Setup — GSU / GT

> How to take Smart Basket + Food Run from "code works" to "useful for real
> students around Georgia State (GSU) and Georgia Tech (GT)." Covers DB setup,
> safe Supabase deploy, populating real place data, crawler enablement, and what
> is real vs estimated.

## 0. Region facts (already seeded)

| slug | name | lat | lng | radius |
|---|---|---|---|---|
| `gsu` | Georgia State University | 33.7531 | -84.3857 | 3 mi |
| `gt` | Georgia Tech | 33.7756 | -84.3963 | 3 mi |

Campus slugs `gsu`/`gt` exist too. `pnpm seed` creates these.

## 1. Environment

Required for the data pipeline (set in `backend/.env`, see `backend/.env.example`):

```
DATABASE_URL=            # pooled (pgbouncer / port 6543) — app runtime
DIRECT_DATABASE_URL=     # direct (port 5432) — migrations only
GOOGLE_PLACES_API_KEY=   # places discovery + photos
GOOGLE_GEMINI_API_KEY=   # place enrichment + basket explanation
AI_ENABLED=true          # gate Gemini (default true)
# generation abuse guard (new this phase)
GEN_RATE_LIMIT_PER_MIN=20
GEN_RATE_LIMIT_BURST=5
CRAWLER_RESPECT_ROBOTS=true
```

Production (`APP_ENV=production`) additionally fail-fast requires Supabase, Redis,
Meilisearch, Firecrawl, Gemini keys (see `backend/src/config/env.schema.ts`).

## 2. Local database (safe to iterate)

```bash
cd backend
# local Postgres/PostGIS (colima/docker), then:
pnpm prisma:generate
pnpm prisma:migrate     # dev — applies migrations incl. launch_hardening
pnpm seed               # categories, campuses, regions, crawl sources, curated places
pnpm start:dev          # API on :3000

# local smoke test
curl -s localhost:3000/health/ready
curl -s -X POST localhost:3000/v1/feeds/food-run \
  -H 'content-type: application/json' \
  -d '{"latitude":33.7531,"longitude":-84.3857,"goal":"under_10"}' | jq .
curl -s -X POST localhost:3000/v1/grocery/baskets/generate \
  -H 'content-type: application/json' \
  -d '{"latitude":33.7531,"longitude":-84.3857,"budget":35,"goal":"high_protein","timeframe":"3_days"}' | jq .
```

Even before discovery runs, Food Run returns the **curated GSU/GT spots** (see §5),
labeled `manual_curated` / `estimated`.

## 3. Supabase deploy (safe — never ad-hoc DDL)

The `dealy` Supabase project exists but its `public` schema is currently **empty**.
Apply the schema **through Prisma only** so migration history stays in sync. Do NOT
run `apply_migration`/raw DDL via the dashboard or MCP — that desyncs Prisma.

```bash
cd backend
# point at Supabase (use the DIRECT connection for migrate deploy)
export DATABASE_URL="postgresql://...@db.<ref>.supabase.co:6543/postgres?pgbouncer=true"
export DIRECT_DATABASE_URL="postgresql://...@db.<ref>.supabase.co:5432/postgres"

pnpm prisma:generate
pnpm prisma:deploy      # = prisma migrate deploy (idempotent; applies all migrations)
pnpm seed               # idempotent upserts (categories, regions, curated places)

# Supabase smoke test (against the deployed API or a local API pointed at Supabase)
curl -s "$API_BASE_URL/health/ready"
```

Verify in MCP afterward with `list_tables` / `list_migrations` (read-only). Get the
connection string + DB password from the Supabase dashboard (Project → Settings →
Database). These are secrets — keep them out of git.

## 4. Populate real place data for GSU/GT (Food Run candidates)

Three staged CLIs (each capped + paced; safe to re-run, resumable):

```bash
cd backend
# 1) discover — Google Places. Use the 'launch' preset for broader categories
#    (restaurant, cafe, bakery, supermarket, bar, meal_takeaway) instead of the
#    safe default (restaurant, cafe).
pnpm places:discover gsu 40 --categories=launch
pnpm places:discover gt 40 --categories=launch
# 2) enrich — Gemini metadata (budget tip, scores, vibe tags, lateNight/studySpot)
pnpm places:enrich gsu
pnpm places:enrich gt
# 3) photos — keyless Google photo URLs (batch, capped)
pnpm places:photos gsu
pnpm places:photos gt
```

Costs/caps: discovery ≈ 1 Places call per category; enrichment paced at
`GEMINI_ENRICH_RATE_PER_MIN` (15/min) + cached; photos capped by
`MAX_PLACE_PHOTO_LOOKUPS_PER_RUN` (50) / `MAX_PLACE_PHOTOS_PER_REGION` (100).

Late-night / study-spot are **enrichment-derived** (tags + the new `lateNight` /
`studySpot` flags), not Google categories.

## 5. Curated student-friendly places

`backend/prisma/curated-places.ts` (run via `pnpm seed`) upserts ~10 real GSU/GT
student spots as `Place` rows with `source='manual'`, `curatedStudentFriendly=true`,
`manualReviewStatus='approved'`, honest `estimatedMealMin/MaxMinor`,
`recommendedOrder`, `budgetTip`, and `launchRegionPriority`. Google `rating` is left
**null** (we do not fabricate ratings). To add more: append entries there and
re-run `pnpm seed`. Food Run includes these even before discovery enrichment runs.

## 6. Crawler / grocery deals (real, gated)

- **robots.txt is now enforced** (`CRAWLER_RESPECT_ROBOTS=true`): the source fetch
  path skips URLs explicitly `Disallow`ed (fail-closed) and warns-but-proceeds when
  robots.txt is unreachable (fail-open). Verify a source is permitted before
  enabling it.
- Sources are gated by `CrawlSource.enabled` (seed.ts). Today only Aldi + a couple
  restaurant/campus sources are enabled.
- **Food City enablement plan:** (1) confirm `foodcity.com/weekly-ad` + `/coupons`
  are crawlable under robots; (2) flip `enabled: true` for the two seeded Food City
  sources; (3) run the crawler; (4) review extracted deals (confidence + source_url
  + last_verified) before they surface; (5) low-confidence extractions stay
  `needs_verification` until a human approves.
- Real grocery deals (published `Deal`s) automatically upgrade Smart Basket items
  from `estimated` to `source_backed`/`verified` and become `matched_deals`.

## 7. Abuse protection (this phase)

`/v1/grocery/baskets/generate`, `.../regenerate`, and `/v1/feeds/food-run` are
`@Public()` but now behind an in-memory per-IP token-bucket guard
(`GEN_RATE_LIMIT_PER_MIN` / `GEN_RATE_LIMIT_BURST`, HTTP 429 on exceed). Generation
is structured-logged (region, goal, confidence, durationMs, geminiUsed, cacheHit).
Gemini cost is bounded by AI cache + rate limiter + template fallback.
**TODO (multi-instance prod):** swap the in-memory guard for `@fastify/rate-limit`
+ Redis. **TODO (auth):** gate Save + per-user limits once iOS auth lands.

## 8. Real vs estimated

| Signal | Real? |
|---|---|
| Place name/address/coords/rating (from Google Places) | Real |
| Place budget tip / why / scores (Gemini) | Real AI inference (`gemini_tip`) |
| Curated student spots | Real spots, `manual_curated`, honest **estimated** meal cost (no fake rating) |
| Food Run estimated meal cost | Estimated (price bucket or curated min/max) |
| Food Run `open now` | Estimated heuristic (no store hours stored) |
| Matched grocery/restaurant deal | Real published `Deal` (`source_backed`/`verified`) |
| Smart Basket item prices (no matched deal) | Estimated staples catalog |

## 9. What still blocks a real launch

1. **Supabase not provisioned** — run §3 (needs DB secrets).
2. **Place data not populated** — run §4 for `gsu` + `gt` (needs Google/Gemini keys).
3. **iOS auth** — saving is still local-only; no per-user sync or per-user limits.
4. **Thin real grocery deals** — only Aldi enabled; baskets are mostly estimated
   until §6 expands (Food City, etc.).
5. **No production deploy / push delivery** — out of scope for this phase.

## 10. Recommended next 3 tasks

1. Provision Supabase (§3) + run GSU/GT place pipeline (§4); smoke-test live.
2. Enable + verify Food City (and Aldi item-level) per §6 to convert estimated
   baskets into deal-backed ones.
3. Add iOS auth so saving syncs and per-user rate limits replace the IP guard.
