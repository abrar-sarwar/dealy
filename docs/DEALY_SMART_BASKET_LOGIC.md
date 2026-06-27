# Smart Basket — Data & Decision Logic

> How Dealy auto-builds a grocery run: budget + goal + timeframe → basket + best
> store + estimated total + honest explanation. Endpoint:
> `POST /v1/grocery/baskets/generate` (also `/:id/regenerate`, `GET /:id`).

## Inputs
latitude, longitude, region/campus, `budget`, `goal` (cheapest · meal_prep ·
high_protein · dorm_snacks · breakfast · quick_meals · healthy · party · custom),
`timeframe` (today · 3_days · 1_week), `dietary[]`, `excludedItems[]`,
`preferredStores[]`, `maxDistance`, `allowSecondStop`.

## Pipeline (deterministic, <1s; no live AI for item selection)
1. **Resolve location** → region + candidate grocery stores (nearby published
   grocery `Deal`s, Places grocery results, known-store fallback list).
2. **Select staples** — `GroceryCatalogService` filters the seeded staples catalog
   by goal affinity + dietary − excluded; greedily fills toward budget at
   timeframe-scaled quantities; swaps expensive items down to fit.
3. **Match real deals** — keyword-match published grocery deals to items → set
   `matched_deal_id`, adjust price, compute deal confidence (source trust +
   verification + recency).
4. **Rank stores** — `BasketRecommendationService` (pure):
   `itemMatchRate·0.35 + estSavings·0.25 + dealConfidence·0.15 + distanceScore·0.15
   + budgetFit·0.10 − lowConfidencePenalty`; second stop only when combo savings >
   8% of budget. Store recs now carry `latitude`/`longitude` (mappable).
5. **Explain** — deterministic template, optionally upgraded by Gemini (paced via
   `RateLimiter`, cached in `AiCache` 24h, template fallback; gated by `AI_ENABLED`).
6. **Persist** + map to `BasketDto`.

## Trust labels (per item & deal)
`verified` · `source_backed` · `estimated` · `gemini_tip` · `manual_curated` ·
`low_confidence` · `needs_verification` · `user_reported` · `mock`. Catalog prices
are `estimated` and never shown as verified. Only real published grocery `Deal`s
become `source_backed`/`verified` matches. Banner when real coverage is thin:
*"Estimated basket based on known student staples and available local deals."*

## Abuse protection
`generate`/`regenerate` are `@Public()` behind the per-IP generation throttle
(`GEN_RATE_LIMIT_PER_MIN`/`GEN_RATE_LIMIT_BURST`); requests are structured-logged;
Gemini cost bounded by cache + limiter + template fallback. TODO: Redis-backed
limit + per-user gating once iOS auth lands.

## Real vs estimated
Real: store names/coords, any matched published `Deal`. Estimated: staple item
prices (curated catalog), totals derived from them. See
`docs/DEALY_LAUNCH_REGION_SETUP.md` §8.

## Save
"Save Basket" is local (UserDefaults), surfaced in Saved — like saved deals/places.
`UserBasketSave` table is scaffolded for when iOS auth exists.
