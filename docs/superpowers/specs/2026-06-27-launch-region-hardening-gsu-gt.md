# Launch Region Data Hardening — GSU/GT (Design + Plan)

> Date: 2026-06-27. Phase goal: make Smart Basket + Food Run accurate, trustworthy,
> and launch-ready for ONE region pair (GSU `gsu`, GT `gt`). NO marketplace, NO new
> large feature surface. Harden data, trust, map visibility, and abuse protection.

## Constraints
- Do NOT run ad-hoc DDL on Supabase; all schema via Prisma migrations. Don't desync
  migration history. Document commands; only run locally where safe.
- Do NOT break existing public dev flow, feeds, map, saved, auth, crawler.
- Do NOT fake verified deals. Estimated/curated data must be labeled as such.
- Reuse existing Places/discovery/enrichment/crawler architecture — no duplication.
- Stay on branch `feat/place-budget-tips`. No new git branches.

## Shared contract additions (backend + iOS must match)

### Trust label taxonomy (wire `trust_label` / `source_status` values)
`verified` · `source_backed` · `estimated` · `gemini_tip` · `manual_curated` ·
`low_confidence` · `needs_verification` · `user_reported` · `mock`.
iOS `TrustLabel.from(apiValue:)` maps all; unknown → `estimated`. Display:
verified→"Verified deal"(green check), source_backed→"Source-backed"(blue),
estimated→"Estimated price"(gray), gemini_tip→"Budget tip"(amber bulb),
manual_curated→"Curated pick"(purple star), low_confidence→"Low confidence"(orange),
needs_verification→"Needs verification"(orange), user_reported→"User reported",
mock→"Sample".

### StoreRecommendation gains coordinates
`StoreRecommendationDto` + `GroceryStoreRecommendation` add `latitude`/`longitude`
(nullable). iOS `StoreRecommendation` decodes them → maps the store + second stop.

## Backend tasks

### BH1 — Migration `20260627140000_launch_hardening`
Add to **Place**: `lateNight Boolean?`, `studySpot Boolean?`,
`chainClassification String?` (`chain|local|unknown`) `@map`,
`estimatedMealMinMinor Int?`, `estimatedMealMaxMinor Int?`,
`recommendedOrder String?`, `campusAffinity String?`,
`launchRegionPriority Int @default(0)`, `manualReviewStatus String @default("none")`
(`none|pending|approved|rejected`). (curatedStudentFriendly + budgetTip already exist.)
Add to **GroceryStoreRecommendation**: `latitude Float?`, `longitude Float?`.
`pnpm prisma:generate`. Raw SQL migration matching existing style. No other tables.

### BH2 — HTTP rate limiting + logging + caching (#2)
- Add a lightweight in-memory per-IP throttle guard `GenerationThrottleGuard`
  (token-bucket; configurable via env `GEN_RATE_LIMIT_PER_MIN` default 20,
  `GEN_RATE_LIMIT_BURST` default 5). Apply to `POST /v1/grocery/baskets/generate`,
  `.../regenerate`, `POST /v1/feeds/food-run`. 429 on exceed. Document that
  multi-instance prod should swap for `@fastify/rate-limit` + Redis (TODO comment).
- Structured pino logs in `GroceryBasketService.generate` and `FoodRunService.bestPlace`:
  region, goal, confidence, sourceStatus, itemCount/placeCount, durationMs,
  geminiUsed (basket only), cacheHit. Optional PostHog event if configured.
- Short-TTL in-memory cache for Food Run results keyed by
  round(lat,3)|round(lng,3)|goal|budget|maxDist (TTL 120s) to absorb repeat taps.
- Confirm basket explanation already gated by AI_ENABLED + AiCache + template
  fallback + RateLimiter (it is). Add `// TODO(auth): gate Save + per-user limits
  once iOS auth lands` near the public endpoints.

### BH3 — Food Run uses new Place fields (#4)
In `food-run.service.ts`: prefer `estimatedMealMin/MaxMinor` for estimated cost +
budgetFit when present (fallback to price-bucket). `lateNight` flag boosts
`late_night`/timeOfDay=late_night; `studySpot` boosts `study_spot`;
`chainClassification` drives the chain/local filter (fallback to name-list when
`unknown`); `launchRegionPriority` is a small additive tiebreak;
`recommendedOrder` overrides budgetTip for `recommended_order` when present. Add
tags "late night"/"quiet study" from flags. Keep `rankPlaces`/`scorePlace` pure.

### BH4 — Curated places seed (#5)
`prisma/curated-places.ts` (invoked from seed.ts): upsert a small set (~8–10) of
REAL, well-known GSU/GT student spots as `Place` rows with `source='manual'`,
`curatedStudentFriendly=true`, `manualReviewStatus='approved'`,
`launchRegionPriority` set, `recommendedOrder` + `budgetTip` (honest),
`estimatedMealMin/MaxMinor`, `priceBucket`, `regionSlug` gsu/gt, `campusAffinity`.
Do NOT fabricate Google `rating`/`userRatingsTotal` — leave null (honesty). Set
`affordabilityScore`/`studentValueScore`/`cheapEatsScore` conservatively so they
rank. These are immediately Food-Run-eligible even before discovery runs.
Food Run candidate query must include curated/manual places (currently filters
`enrichedAt != null`) — broaden to `enrichedAt != null OR source='manual'`.

### BH5 — Discovery launch category preset (#3)
Add a `launch` category preset to `place-discovery.service.ts`
(`restaurant, cafe, bakery, supermarket, grocery_or_supermarket, bar, meal_takeaway`)
selectable via CLI arg/option (do NOT change the safe default). Document running
`places:discover gsu 40 --categories=launch` (or equivalent). Late-night/study-spot
remain enrichment-derived tags.

### BH6 — Trust labels in mappers (#9)
`grocery.mapper.ts` + `food-run` mapping: emit the extended taxonomy — catalog
items → `estimated`; matched real deal → `source_backed`/`verified` by
verificationStatus; place budget tip surfaced as `gemini_tip`; curated place →
`manual_curated`; low-confidence extracted deal → `low_confidence` /
`needs_verification`. Add `latitude`/`longitude` to store rec mapping (BH1).

### BH7 — robots.txt enforcement (#8)
Add `RobotsChecker` (cached per-host fetch + parse) used by the crawler source
fetch path: fail-CLOSED (skip + log + record failure) on explicit `Disallow` for
the path/UA; fail-OPEN-with-warning when robots.txt is unreachable. Env
`CRAWLER_RESPECT_ROBOTS` default true. Do NOT change which sources are enabled.
Unit-test allow/disallow/unreachable.

### BH8 — Store rec coordinates populated (#7)
`grocery-basket.service.ts`: populate store rec `latitude`/`longitude` from the
matched Place/Deal of the chosen store when available.

### BH9 — Tests + openapi (#10)
Jest: food-run scoring with new fields + filters; throttle guard; RobotsChecker;
curated candidate inclusion; mapper trust labels + store coords. Keep existing
green. `pnpm openapi:export`.

## iOS tasks

### IH1 — Trust label taxonomy (#9)
Extend `TrustLabel` enum + `TrustLabelChip` with the new cases + colors per contract;
safe `from(apiValue:)` fallback. Update mapping tests.

### IH2 — Food Run decision cards on Home (#6)
Add a row/section of decision cards on Home (and refresh Explore): "Best lunch move
today"→quick_lunch, "Under $10 near you"→under_10, "Best study spot nearby"→study_spot,
"Quick bite near campus"→quick_lunch, "Worth the walk"→best_value, "Late-night move"
→late_night (only shown when local time ≥ 8pm). Each opens Food Run preset to the goal.
Reuse existing FoodRunDecisionCard. Keep clean.

### IH3 — Map visibility (#7)
- Food Run result: add a "Show on map" affordance and render the selected place +
  ranked alternatives as pins (reuse existing place-pin/photo rendering); use real
  images when available; selected pin highlighted. (An inline map in the result or
  routing into the Map tab centered on the place — pick the lower-risk option.)
- Smart Basket: `StoreRecommendation` now has coords → show best store + optional
  second stop pins + a route/Directions CTA (reuse DirectionsLauncher).
- Decode store `latitude`/`longitude` in `StoreRecDTO`.

### IH4 — Tests (#10)
DTO mapping for new trust labels + store coords; decision-card goal mapping;
late-night card time-gating logic (pure helper).

## Docs (#1, #3, #8, #10)
- `docs/DEALY_LAUNCH_REGION_SETUP.md`: env vars; local `prisma migrate dev`+seed+smoke
  test; **safe Supabase deploy** (`prisma migrate deploy` with `DIRECT_DATABASE_URL`,
  then `seed`, then health smoke test) — never ad-hoc DDL; GSU/GT discovery→enrich→
  photos runbook + costs/caps; curated places how-to; robots/crawler enablement +
  Food City plan; real-vs-estimated table; what blocks launch.
- `docs/DEALY_SMART_BASKET_LOGIC.md`: basket data logic + trust.
- Update `docs/DEALY_FOOD_RUN_LOGIC.md`: new fields, trust taxonomy, map.

## Verify
Backend: `pnpm typecheck`, `pnpm test -- "(food-run|grocery|crawler|robots)"`, openapi.
iOS: `xcodegen generate` + `./scripts/build.sh build` + `test` (keep 312 green).
