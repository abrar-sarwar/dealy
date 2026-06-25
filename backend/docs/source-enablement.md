# Crawl-source enablement (persisted vs runtime)

`crawl_sources` are seeded from `prisma/seed.ts`. `seedCrawlSources()` creates each
source with `enabled: s.enabled ?? false` — so a source is **disabled by default**
unless its seed entry carries `enabled: true`. On UPDATE the seed never flips
`enabled`, preserving operator state.

## Enabled in code today (a fresh `pnpm seed` brings these up)
Verified to yield real, image-bearing, correctly-classified offers:
- **Aldi** (grocery — real Instacart product photos)
- **Chili's**, **Applebee's** (restaurants — real food photos)
- **GSU Student Center**, **UGA Benefits**, **UGA PAC** (campus/student)

## Persisted but disabled by default (config exists; NOT crawled on fresh seed)
GT BuzzCard, GT Perks & Programs, KSU Perks, Discover Atlanta, Ponce City Market,
Atlanta BeltLine, Regal Cinemas, Great Clips, and the other curated entries. These
have a seed entry (so the config is version-controlled) but stay off until verified.

> **Important:** any deals you see in the *local* dev DB from these disabled sources
> are **runtime-only** — they were produced by a manual `discovery:run` trial and are
> NOT reproduced by a fresh seed. Do not treat them as shipped product data. The GT
> BuzzCard restaurants (Five Guys / Hattie B's / Rocky Mountain Pizza) are in this
> category as of this writing.

## How to enable + run a source (operator workflow)
1. Confirm the source page is real, HTTP 200, and lists concrete current offers.
2. Set `enabled: true` on its `seed.ts` entry (with a `dealUrl` if it's a list page so
   `resolveCrawlTargets` keeps the deep link), then `pnpm seed`.
   - Or, for a one-off trial without persisting: enable it directly in the DB and run.
3. `pnpm discovery:run <zone>` — scrapes (Firecrawl) → extracts (Gemini) → stores
   candidates → resolves merchant/location (Google Places) → promotes high-confidence
   ones into `deals`.
4. Verify it yields ≥1 concrete, correctly-classified, image-bearing offer before
   leaving it enabled. Never seed fabricated deals.
