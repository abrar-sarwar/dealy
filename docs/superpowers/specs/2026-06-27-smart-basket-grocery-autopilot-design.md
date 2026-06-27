# Smart Basket (Grocery Autopilot) — Design Spec

> Date: 2026-06-27
> Status: Approved design, pre-implementation
> Scope: Phase 1 of a larger "Dealy decides for you" initiative. This spec covers
> Smart Basket + a lightweight "Cheap Food Run" + a marketplace roadmap doc.
> Deferred to later specs: "make Dealy unique" decision cards, admin data-quality views.

## 1. Problem & North Star

Students do not know what to buy, where to go, or which store is actually cheapest,
and they will not manually compare weekly ads. Dealy should decide for them.

North star: **Dealy is the app students open before spending money nearby.**

User-facing promise:
> "Tell Dealy your budget and what kind of grocery run you need. Dealy builds the
> list, finds matching deals, tells you where to go, estimates the total, and
> explains why."

User-facing name: **Smart Basket**. Code namespace: backend module `grocery`,
iOS folder `SmartBasket`, endpoints under `/v1/grocery/...`.

## 2. Scope (decided)

- **In (this spec):** Smart Basket end-to-end (iOS flow + backend services + DB +
  deterministic recommendation engine + trust labels + out-of-area fallback);
  lightweight "Cheap Food Run" reusing existing Places/Gemini data; the
  `docs/DEALY_MARKETPLACE_ROADMAP.md` doc.
- **Out (later specs):** "Best move today / Under $10 near you" decision cards on
  Home/Explore; admin data-quality dashboards; the actual marketplace.
- **Entry point (decided):** prominent entry card at top of **Home** and a section
  in **Explore**. No new tab. Flow opens as a `fullScreenCover`.
- **Engine (decided):** deterministic catalog + rules/scoring; Gemini used only to
  upgrade the short explanation text (paced + cached, template fallback). No
  live-AI item selection or pricing.

## 3. Key Design Principles

1. **Trust over magic.** Estimated prices are labeled `estimated` and never shown
   as verified deals. Only real published grocery `Deal`s become `verified` /
   `source_backed` matches.
2. **Fast & testable.** Generation is deterministic and completes in <1s without a
   network AI call. Gemini explanation is best-effort and falls back to a template.
3. **Works everywhere, honestly.** Out-of-coverage users still get a basket from
   estimated staples + nearby Places stores, flagged lower-confidence.
4. **Reuse, don't duplicate.** Follow existing module/service/DTO/design-token
   conventions. Do not modify existing feeds, map, saved, auth, or crawler logic.
5. **Guest-safe.** Works with no auth (feeds are `@Public()`; iOS has no session
   yet). "Save Basket" is local (UserDefaults), mirroring saved deals.

## 4. Backend Architecture

New module `backend/src/grocery/` following the `discovery`/`feeds` conventions
(controller + services + DTOs + mapper + specs). Registered in `app.module.ts`.

### Services

- **`GroceryCatalogService`** — loads the seeded staples catalog; filters staples by
  goal affinity, dietary prefs, and exclusions; exposes price estimates.
- **`BasketRecommendationService`** — pure scoring/ranking brain. No I/O. Fully unit
  tested. Computes per-store scores, best single store, optional second stop,
  confidence, and missing items.
- **`GroceryBasketService`** — orchestrates generation, deal matching, persistence,
  and (best-effort) Gemini explanation; owns regenerate and fetch-by-id.

### Generation pipeline (deterministic)

1. **Resolve location** → region/campus (reuse existing region resolution used by
   the places feed) + candidate grocery stores from: nearby published grocery
   `Deal`s, Places grocery results, and a known-store list.
2. **Select staples** — filter catalog by `goal` affinity + `dietary` − `excluded`;
   greedily fill toward `budget` at `timeframe`-scaled quantities until budget is
   approached or core coverage met.
3. **Price** — `estimatedPriceMinor × quantity` per item; sum = estimated total. If
   over budget, swap expensive staples for cheaper affinity-matched ones.
4. **Match real deals** — query published grocery deals (category grocery/food,
   grocery store, within radius). Fuzzy keyword match to items → set
   `matchedDealId`, adjust item price to deal price, set `dealConfidence` from
   source trust + verification status + recency.
5. **Rank stores**:
   ```
   best_store_score =
       itemMatchRate     * w_match
     + estimatedSavings  * w_savings
     + dealConfidence    * w_confidence
     + storeDistanceScore* w_distance
     + budgetFitScore    * w_budget
     - secondStopPenalty
     - lowConfidencePenalty
   ```
   Pick best single store. Compute a two-store combo only if
   `comboSavings > travelCostThreshold`. Produce `routeSummary`, `confidence`
   (`low`|`medium`|`high`), and `missingItems`.
6. **Explain** — deterministic templated sentence (e.g. "Aldi covers 90% of your
   basket under budget; Publix is only worth it for the BOGO snack deal").
   Best-effort Gemini upgrade via the existing `RateLimiter` + AI cache; template is
   the fallback if AI is disabled, rate-limited, or errors.
7. **Persist** — basket + items + store recs + deal matches.

### Trust labeling

Per item & per deal label: `verified` · `source_backed` · `estimated` ·
`user_reported` · `mock`. Basket-level `sourceStatus` drives the banner. When real
grocery deal coverage is thin: *"Estimated basket based on known student staples
and available local deals."*

## 5. Database (Prisma)

New migration `..._smart_basket`. UUID PKs, snake_case `@map`, `createdAt`/
`updatedAt` conventions. **No existing tables changed.**

- **`GroceryStapleItem`** (seeded reference): `slug` (unique), `name`, `category`,
  `unit`, `defaultQuantity`, `estimatedPriceMinor`, `dietaryTags String[]`,
  `goalAffinities String[]`, `prepLevel`, timestamps. `@@map("grocery_staple_items")`.
- **`GroceryBasket`**: `userId String?` (guest-safe), `title`, `goal`, `budgetMinor`,
  `timeframe`, `latitude`, `longitude`, `regionSlug?`, `campusSlug?`,
  `estimatedTotalMinor`, `estimatedSavingsMinor`, `confidence`, `explanation`,
  `sourceStatus`, `dietaryPrefs String[]`, `createdAt`. `@@map("grocery_baskets")`.
- **`GroceryBasketItem`**: `basketId`, `name`, `stapleSlug?`, `category`,
  `estimatedPriceMinor`, `quantity`, `unit`, `storeName?`, `matchedDealId?`,
  `confidence`, `substitutions Json`, `trustLabel`. `@@map("grocery_basket_items")`.
- **`GroceryStoreRecommendation`**: `basketId`, `storeName`, `placeId?`,
  `kind` (`best_single`|`second_stop`), `score`, `estimatedTotalMinor`,
  `estimatedSavingsMinor`, `distanceMiles?`, `reason`.
  `@@map("grocery_store_recommendations")`.
- **`GroceryDealMatch`**: `basketItemId`, `dealId`, `merchant`, `title`, `discount`,
  `priceMinor`, `validUntil?`, `source`, `lastVerifiedAt?`, `confidence`,
  `sourceUrl?`. `@@map("grocery_deal_matches")`.
- **`UserBasketSave`** (scaffold for future auth): `userId`, `basketId`, `createdAt`.
  `@@map("user_basket_saves")`. Not used by iOS yet — Save Basket is local today.

Seed: a curated student-staples catalog (~40–60 items across produce, protein,
dairy, grains, frozen, pantry, snacks, beverage) added to `prisma/seed.ts`. These
are honest estimates, not fake deals.

## 6. API

`class-validator` DTOs, `@Public()` (like feeds), Swagger-annotated. Money in minor
units internally, dollars at response boundary (existing mapper convention).

- **`POST /v1/grocery/baskets/generate`** → `BasketDto`. Works without auth and
  out-of-area.
- **`POST /v1/grocery/baskets/:id/regenerate`** → `BasketDto`. (POST, not GET —
  re-rolls/creates state. Corrects the malformed path in the original brief.)
- **`GET /v1/grocery/baskets/:id`** → `BasketDto`.
- **`POST /v1/feeds/food-run`** → Cheap Food Run: best place + estimated cost + why
  + budget tip + matched restaurant deal, reusing stored Places/Gemini data
  (read-only, no live AI). Lives on the existing feeds controller / discovery.

### Request payload (generate)

`latitude`, `longitude`, `region?`/`campus?`, `budget`, `goal`, `timeframe`,
`dietary[]`, `excludedItems[]`, `preferredStores[]`, `maxDistance?`,
`allowSecondStop` (bool).

### Response (`BasketDto`)

`basket_id`, `title`, `estimated_total`, `estimated_savings`, `best_store`,
`optional_second_store`, `route_summary`, `confidence`, `items[]`,
`matched_deals[]`, `substitutions`, `explanation`, `source_status`.

- **item**: `name`, `category`, `estimated_price`, `quantity`, `unit`, `store`,
  `matched_deal_id?`, `confidence`, `substitution_options[]`, `trust_label`.
- **matched deal**: `merchant`, `title`, `discount`, `price`, `valid_until?`,
  `source`, `last_verified_at?`, `confidence`, `source_url?`.

OpenAPI regenerated via `pnpm openapi:export`.

## 7. iOS

Matches `DealServicing` + `@Observable` AppState + `TabRouter` + `Theme`/`Spacing`/
`Radius` tokens + reusable `DealyCard`/`InfoChip`/capsule chips.

### Service wiring

- `SmartBasketServicing` protocol + `RemoteSmartBasketService` (APIClient) +
  `MockSmartBasketService` (returns a labeled estimated basket so the flow works
  offline / before real data). Wired through `RemoteComposition.make` →
  `AppState` → `DealyApp.init`, exactly like `PlaceFeedServicing`.

### Models (`Models/`), DTOs (`Services/API/`)

- Domain: `SmartBasket`, `BasketItem`, `StoreRecommendation`, `BasketDealMatch`.
- Enums: `BasketGoal` (cheapest, mealPrep, highProtein, dormSnacks, breakfast,
  quickMeals, healthy, party, custom), `BasketBudget` ($20/$35/$50/$75/custom),
  `BasketTimeframe` (today/3 days/1 week), `DietaryPreference` (vegetarian, halal,
  highProtein, lowPrep, noCooking, healthy, bulkValue, snacksDrinks),
  `TrustLabel` (verified, sourceBacked, estimated, userReported, mock).
- DTOs with `.toDomain()` mappers at the service boundary (never DTOs in views).

### Screens (`Views/SmartBasket/`)

- **`SmartBasketEntryCard`** — hero card at top of Home + section in Explore; opens
  `SmartBasketSetupView` as `fullScreenCover`.
- **`SmartBasketSetupView`** — quick-card quiz: "What kind of grocery run do you
  need?" → goal chips → budget chips → timeframe chips → optional preference chips.
  One tap generates. <15s target. Uses capsule-chip selection pattern.
- **`GeneratedBasketView`** — title ("$35 High-Protein Grocery Run"), best-store
  card, estimated total, `ConfidenceBadge`, items grouped by category with
  `TrustLabelChip`, matched deals, suggested swaps, "Worth a second stop?" card,
  actions: Open in Maps · Save Basket · Regenerate · Adjust Budget · Remove item ·
  Swap item · Use this basket.
- **`FoodRunView`** — lighter "Where should I eat right now?" reusing Places.
- Components: `StoreRecommendationCard`, `BasketItemRow`, `ConfidenceBadge`,
  `TrustLabelChip`.

### Cross-feature wiring

- Save Basket → AppState `persisted` (UserDefaults), surfaced as a section in
  **Saved**.
- Open in Maps / route → reuse the existing in-app directions on the Map.
- Out-of-area → still generates, lower confidence + honest banner + "request your
  zone" affordance.
- Restaurant matches link into the existing Places experience.

## 8. UX copy & states

- Good empty/low-data state: *"Not enough verified grocery deals here yet. I can
  still build an estimated basket from student staples and nearby stores."*
- User-facing decision language: "Best overall", "Cheapest single stop", "Worth a
  second stop", "Not worth it today".
- Smooth chip selection, no walls of text, playful-but-not-childish tone.

## 9. Testing

- **Backend (Jest, `*.spec.ts` beside source):** recommendation scoring,
  under-budget generation, deal matching, store ranking (single vs combo),
  out-of-area path, trust labeling.
- **iOS (XCTest):** setup→request mapping, DTO→domain mapping, mock generation,
  budget/goal selection logic.
- App must still build (`xcodegen generate` + build). Backend `lint`, `typecheck`,
  `test` run where possible. No regression to feeds/map/saved/auth/crawler.

## 10. Marketplace roadmap (doc only)

`docs/DEALY_MARKETPLACE_ROADMAP.md` explaining: how Smart Basket evolves into local
commerce; how Dealy becomes a student-first nearby marketplace; why it can beat
Facebook Marketplace (campus-verified, safer, cleaner listings, better
search/recs, less spam, easier meetups, smart price suggestions); what to build
later (listing model, seller profile, campus verification, condition, pickup zones,
safe meetup spots, price/quality/scam scores, saved search, ISO posts, bundles,
student-only visibility, reporting, stale cleanup); and what NOT to build yet. No
marketplace code in this phase.

## 11. Deliverables (end of implementation)

Summary of changes; files modified; new endpoints; new models/migrations; how to
test locally; what is mocked vs real; what still needs real grocery data; next
recommended steps.

## 12. What still needs real data (known limitation)

Real grocery item-level prices/deals are thin today (only Aldi crawler enabled;
Food City and others seeded but disabled). v1 ships with the estimated staples
catalog + matching against whatever real grocery deals exist. The architecture
(catalog, price-estimate, deal-match tables) is built to absorb real item-level
data later without UI or contract changes.
