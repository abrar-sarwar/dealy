# Discovery sources & runbook

How to enable curated sources, run a discovery pass, inspect the results, and
avoid burning Gemini quota. The pipeline is:

```
crawl_sources → Firecrawl scrape → Gemini extract → deal_candidates → promotion → deals → /v1/feeds/local → iOS
```

All cost controls (Firecrawl page caps, AI cache, the Gemini `planCrawl` gate,
content-hash skip, and the 429-quota region stop) stay in force regardless of
which sources are enabled.

## 1. Enable a small set of verified sources

Sources are **seeded `enabled: false`** on purpose — an operator verifies each
is live and Firecrawl-crawlable before turning it on. Enable a focused set
(≤ 8 at a time during testing) scoped to one zone:

```sql
-- inspect what's available for a zone
SELECT id, url, default_category_slug, enabled, last_crawled_at
FROM crawl_sources WHERE zone_slug = 'atlanta' ORDER BY default_category_slug;

-- enable a balanced handful (edit the URL list to the ones you verified)
UPDATE crawl_sources SET enabled = true
WHERE url IN (
  'https://www.publix.com/savings/weekly-ad',     -- groceries
  'https://www.chilis.com/specials',              -- food
  'https://www.foxtheatre.org/events',            -- entertainment
  'https://www.massageenvy.com/offers'            -- beauty
);
```

Prefer **already-targeted deal pages** (paths like `/deals`, `/specials`,
`/offers`, `/events`, `/coupons`, `/weekly-ad`, `/student-discounts`). Avoid
plain menu/homepage URLs — they rarely yield concrete deals and waste a paid
Firecrawl fetch + a Gemini call. A homepage source must carry a `dealUrl` or
`targetPaths` or it resolves to nothing and is skipped (no bare-domain crawl).

## 2. Run a discovery pass

```bash
cd backend
pnpm discovery:run atlanta
```

This walks the enabled `atlanta` sources, applies the budget + `planCrawl`
gate, scrapes via Firecrawl, extracts with Gemini (`gemini-3.1-flash-lite`),
stores `deal_candidates`, and promotes qualifying ones to published `deals`.
It prints a JSON summary (`sourcesConsidered`, `pagesFetched`, `geminiSkips`,
`candidatesStored`, `promotion`).

## 3. Inspect the results

```sql
-- crawl runs (per source attempt)
SELECT cr.id, cs.url, cr.pages_fetched, cr.status, cr.created_at
FROM crawl_runs cr JOIN crawl_sources cs ON cs.id = cr.source_id
ORDER BY cr.created_at DESC LIMIT 20;

-- extracted candidates (note: confidence is normalized to 0–100)
SELECT title, merchant, confidence, location_precision, image_url, promoted_at
FROM deal_candidates ORDER BY created_at DESC LIMIT 30;

-- promoted, published deals
SELECT title, merchant, location_precision, latitude, longitude, image_url, expires_at
FROM deals WHERE source = 'crawler' ORDER BY published_at DESC LIMIT 30;
```

```bash
# the geographic local feed the iOS app reads
curl -s "http://localhost:3000/v1/feeds/local?lat=33.7531&lng=-84.3857&radiusMiles=15&limit=50" | jq '.items[] | {title, merchant, distanceMiles, locationPrecision, imageUrl}'
```

**Honest coordinates:** discovered deals carry `location_precision`. When we only
know the region (no street address — the common case for chain coupons), the
deal is `'approximate'` and sits at the region centroid; iOS renders it with a
faded pin and a `~ <area>` label rather than a precise distance. We never
scatter coordinates to fake a precise storefront. `'exact'` is reserved for
deals with a real geocoded location (future).

## 4. Avoid burning Gemini quota

- Enable **5–8 high-quality sources max** while testing — quality over count.
- Prefer **targeted deal pages**; avoid generic menu/homepage pages.
- Keep `GEMINI_MODEL=gemini-3.1-flash-lite` (low-cost). Pro escalation only
  fires for low-confidence + high-reliability sources.
- The `planCrawl` gate, content-hash skip, and AI cache already prevent
  re-paying for unchanged pages; don't bypass them.
- On a 429 `RESOURCE_EXHAUSTED` (daily quota) the region run stops early by
  design — re-run the next day rather than hammering.

## 5. Pilot source list (added in the balanced seed)

All seeded **disabled**; enable after verifying live + Firecrawl-crawlable. The
`curl` status below is a seed-time smoke check only — a `403`/`000` from a plain
`curl` does **not** mean Firecrawl can't crawl it (Firecrawl uses rotating
proxies), so verify with an actual `discovery:run` before ruling a source out.

| Source | Category | Path | curl @ seed | Notes |
|---|---|---|---|---|
| chilis.com/specials | food | `/specials` | 200 | restaurant specials |
| applebees.com/en/specials | food | `/specials` | 403 | likely Firecrawl-crawlable |
| foxtheatre.org/events | entertainment | `/events` | 200 | venue events |
| regmovies.com/movies/promotions | entertainment | `/promotions` | 403 | cinema promos |
| massageenvy.com/offers | beauty | `/offers` | 200 | services offers |
| greatclips.com/offers | beauty | `/offers` | — | salon offers |
| macys.com/shop/deals | clothing | `/deals` | — | retail deals |

Existing grocery (Publix/Kroger/Aldi/Food City), campus dining, and the
Atlanta entertainment pages (Discover Atlanta, BeltLine, Buckhead) remain. The
seed mix is intentionally **not grocery-dominated** (grocery ≈ 29% across 6
categories); the `curated-sources.spec.ts` balance tests enforce this.
