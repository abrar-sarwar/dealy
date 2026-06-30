# Smart Basket (Grocery Autopilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a student tell Dealy a budget + grocery-run goal and get an auto-built, store-routed, price-estimated, deal-matched basket with an honest explanation — plus a lightweight "Cheap Food Run" and a marketplace roadmap.

**Architecture:** New backend `grocery` module (deterministic catalog + rules recommendation engine; Gemini only for explanation text, with template fallback). New iOS `SmartBasket` feature (protocol + mock + remote service, chip-quiz setup, generated-basket screen) entered from Home/Explore cards. No existing tables/feeds/map/saved/auth/crawler logic changed.

**Tech Stack:** NestJS 11 + Fastify + Prisma/Postgres (UUID, snake_case `@map`), class-validator DTOs, Jest. SwiftUI iOS 17, `@Observable` AppState, XcodeGen, XCTest.

## Global Constraints

- Money stored in minor units (`*Minor` BigInt/Int); dollars only at response boundary.
- Prisma: UUID PKs (`@default(uuid()) @db.Uuid`), snake_case `@@map`/`@map`, `createdAt @default(now())` + `updatedAt @updatedAt`.
- Backend endpoints public via `@Public()` (iOS has no auth session). Swagger-annotated.
- ESLint strict: no `any` (use `unknown`+guard), unused args prefixed `_`, no floating promises.
- iOS: domain models in `Models/`, DTOs in `Services/API/` with `.toDomain()` mappers; views use domain models only. Use `Theme`/`Spacing`/`Radius` tokens, reuse `DealyCard`/`InfoChip`/capsule chips. No third-party packages.
- Trust labels: `verified` · `source_backed` · `estimated` · `user_reported` · `mock`. Estimated prices NEVER shown as verified deals.
- User-facing name "Smart Basket"; code namespace `grocery` (backend) / `SmartBasket` (iOS).
- Do not modify existing migrations; add a new one.

---

## Wire Contract (shared by backend + iOS — must match exactly)

`POST /v1/grocery/baskets/generate` request JSON:
```json
{
  "latitude": 33.753, "longitude": -84.386,
  "region": "atl-downtown", "campus": "gsu",
  "budget": 35, "goal": "high_protein", "timeframe": "3_days",
  "dietary": ["high_protein","halal"],
  "excludedItems": ["pork"], "preferredStores": ["Aldi"],
  "maxDistance": 10, "allowSecondStop": true
}
```
`goal` ∈ cheapest | meal_prep | high_protein | dorm_snacks | breakfast | quick_meals | healthy | party | custom.
`timeframe` ∈ today | 3_days | 1_week.
`dietary[]` ∈ vegetarian | halal | high_protein | low_prep | no_cooking | healthy | bulk_value | snacks_drinks.

Response JSON (`BasketDto`):
```json
{
  "basket_id": "uuid",
  "title": "$35 High-Protein Grocery Run",
  "estimated_total": 33.80,
  "estimated_savings": 6.40,
  "confidence": "medium",
  "source_status": "estimated",
  "explanation": "Aldi covers 90% of your basket under budget...",
  "route_summary": "1 stop · Aldi · ~1.2 mi",
  "best_store": { "name": "Aldi", "place_id": null, "kind": "best_single",
    "score": 0.82, "estimated_total": 33.80, "estimated_savings": 6.40,
    "distance_miles": 1.2, "reason": "Covers 90% of your basket under budget" },
  "optional_second_store": null,
  "items": [
    { "name": "Eggs (dozen)", "category": "protein", "estimated_price": 2.49,
      "quantity": 1, "unit": "dozen", "store": "Aldi", "matched_deal_id": null,
      "confidence": "medium", "trust_label": "estimated", "substitution_options": ["Egg whites"] }
  ],
  "matched_deals": [
    { "merchant": "Aldi", "title": "Chicken thighs sale", "discount": "30% off",
      "price": 3.49, "valid_until": "2026-07-01T00:00:00.000Z", "source": "crawler:aldi",
      "last_verified_at": "2026-06-26T00:00:00.000Z", "confidence": "high",
      "source_url": "https://www.aldi.us/weekly-specials/" }
  ],
  "substitutions": []
}
```
`POST /v1/grocery/baskets/:id/regenerate` — same response shape (re-rolled).
`GET /v1/grocery/baskets/:id` — same response shape.
`POST /v1/feeds/food-run` request `{ latitude, longitude, region?, intent, budget? }` where
`intent` ∈ under_10 | high_protein | quick_lunch | late_night | study_spot | date_friends | closest_cheap;
response `FoodRunDto`: `{ place: {id,name,category,price_bucket,rating,latitude,longitude,why_recommended,budget_tip,primary_photo_url}, estimated_cost, reason, matched_deal? , confidence, source_status }`.

---

## Backend Tasks

### Task B1: Prisma models + migration
**Files:** Modify `backend/prisma/schema.prisma`; Create `backend/prisma/migrations/20260627120000_smart_basket/migration.sql`.
Add models `GroceryStapleItem`, `GroceryBasket`, `GroceryBasketItem`, `GroceryStoreRecommendation`, `GroceryDealMatch`, `UserBasketSave` per spec §5. UUID PKs, snake_case `@@map` (`grocery_staple_items`, `grocery_baskets`, `grocery_basket_items`, `grocery_store_recommendations`, `grocery_deal_matches`, `user_basket_saves`). Indexes: baskets by `(userId, createdAt)`; items by `basketId`; staples by `category`. SQL migration mirrors `prisma migrate` output style (CREATE TABLE with snake_case columns, FKs, indexes).
- [ ] Add models; write migration SQL; `pnpm prisma:generate`.

### Task B2: Staples catalog seed
**Files:** Modify `backend/prisma/seed.ts`.
Seed ~45 `GroceryStapleItem` rows across categories produce/protein/dairy/grains/frozen/pantry/snacks/beverage with `estimatedPriceMinor`, `dietaryTags`, `goalAffinities`, `prepLevel`, `unit`, `defaultQuantity`. Upsert by `slug`. Honest national-estimate prices.
- [ ] Add seed block; idempotent upsert.

### Task B3: Pure recommendation engine (TDD)
**Files:** Create `backend/src/grocery/basket-recommendation.service.ts`, `backend/src/grocery/basket-recommendation.service.spec.ts`, `backend/src/grocery/grocery.types.ts`.
`grocery.types.ts`: internal types `CandidateStore`, `BasketLineItem`, `StoreScore`, `RecommendationResult`.
`BasketRecommendationService` (no I/O): `rankStores(items, stores, opts)` → best single, optional second stop, confidence, missingItems using the §4 formula with named weights. `scoreStore(...)` pure helper.
- [ ] Write spec: best single chosen by score; second stop only when comboSavings>threshold; low coverage→low confidence; out-of-area (no stores)→empty stores + low confidence.
- [ ] Implement; tests pass (`pnpm test -- basket-recommendation`). No DB needed.

### Task B4: Catalog + basket services
**Files:** Create `backend/src/grocery/grocery-catalog.service.ts`, `backend/src/grocery/grocery-basket.service.ts`, `backend/src/grocery/grocery-catalog.service.spec.ts`.
`GroceryCatalogService.selectStaples(goal, dietary, excluded, budgetMinor, timeframe)` → `BasketLineItem[]` (greedy budget fill; swaps). `GroceryBasketService.generate(req)`: resolve region + candidate stores (nearby grocery `Deal`s + Places grocery + known list), select staples, match real deals (keyword), call recommendation engine, build explanation (template; Gemini best-effort via existing `GeminiService`+`RateLimiter`+AI cache, fallback to template), persist, map to `BasketDto`. `regenerate(id)` and `getById(id)`.
- [ ] Catalog spec: goal/dietary filter + budget fit (no DB; inject staples array). Implement both services.

### Task B5: DTOs + mapper + controller + module
**Files:** Create `backend/src/grocery/grocery.dto.ts`, `backend/src/grocery/grocery.mapper.ts`, `backend/src/grocery/grocery.controller.ts`, `backend/src/grocery/grocery.module.ts`; Modify `backend/src/app.module.ts`.
class-validator request DTO (`GenerateBasketDto`) matching wire contract; response interfaces; mapper minor→dollars + ISO dates + trust labels. Controller `@Public()` endpoints: `POST generate`, `POST :id/regenerate`, `GET :id`. Register `GroceryModule` (imports Prisma, Discovery for region/places, Gemini) in `app.module.ts`.
- [ ] Wire module; `pnpm typecheck` clean for new files.

### Task B6: Cheap Food Run endpoint
**Files:** Create `backend/src/grocery/food-run.service.ts`, `backend/src/grocery/food-run.service.spec.ts`; Modify `backend/src/feeds/feeds.controller.ts` (add `POST food-run`, `@Public()`).
`FoodRunService.bestPlace(req)` ranks stored Places by intent (reuse place-feed scores; e.g. under_10→affordability+cheapEats, study_spot→vibe tags) → single best place + estimated_cost + reason + budget_tip + matched restaurant deal (nearby food `Deal`). Read-only, no live AI.
- [ ] Spec: intent ranking picks expected place; out-of-area→best available + low confidence. Implement; wire endpoint.

### Task B7: Regenerate OpenAPI
**Files:** `backend/docs/openapi.json` (generated).
- [ ] `pnpm openapi:export`.

## iOS Tasks

### Task I1: Domain models + enums
**Files:** Create `Dealy/Models/SmartBasket.swift` (`SmartBasket`, `BasketItem`, `StoreRecommendation`, `BasketDealMatch`, `TrustLabel`), `Dealy/Models/BasketSetup.swift` (`BasketGoal`, `BasketBudget`, `BasketTimeframe`, `DietaryPreference` with `displayName`, `apiValue`, icon).
- [ ] Value types, `Identifiable`/`Codable`/`Hashable`/`Sendable`. Enums map to wire `apiValue`.

### Task I2: DTOs + mappers (TDD)
**Files:** Create `Dealy/Services/API/SmartBasketDTO.swift`, `DealyTests/SmartBasketDTOMappingTests.swift`.
`BasketDTO`, `BasketItemDTO`, `StoreRecDTO`, `MatchedDealDTO`, `FoodRunDTO` decoding snake_case wire → `.toDomain()`. Unknown enum/trust label falls back safely.
- [ ] Test mapping incl. fallback; implement.

### Task I3: Service protocol + mock + remote
**Files:** Create `Dealy/Services/SmartBasketServicing.swift`, `Dealy/Data/MockSmartBasketService.swift`, `Dealy/Services/API/RemoteSmartBasketService.swift`; Modify `Dealy/Services/API/AuthTokenProviding.swift` (RemoteComposition tuple), `Dealy/ViewModels/AppState.swift`, `Dealy/App/DealyApp.swift`.
`SmartBasketServicing`: `generate(_ request: BasketRequest) async throws -> SmartBasket`, `regenerate(id:) async throws -> SmartBasket`, `foodRun(_:) async throws -> FoodRunResult`. Mock returns labeled estimated basket. Wire into composition root + AppState (`smartBasket` property + persisted saved baskets).
- [ ] Wire all; mock works with `DEALY_API_ENV=mock`.

### Task I4: Setup chip-quiz screen
**Files:** Create `Dealy/Views/SmartBasket/SmartBasketSetupView.swift`, `Dealy/Components/SelectableChip.swift`.
"What kind of grocery run do you need?" → goal/budget/timeframe/optional-preference chips → Generate. `SelectableChip` capsule (selected = filled `Theme.primary`).
- [ ] Build; <15s flow; calls `app.smartBasket.generate`.

### Task I5: Generated basket screen + components
**Files:** Create `Dealy/Views/SmartBasket/GeneratedBasketView.swift`, `Dealy/Views/SmartBasket/Components/StoreRecommendationCard.swift`, `BasketItemRow.swift`, `ConfidenceBadge.swift`, `TrustLabelChip.swift`.
Title, best-store card, total, `ConfidenceBadge`, items grouped by category w/ `TrustLabelChip`, matched deals, swaps, "Worth a second stop?" card, actions (Open in Maps · Save · Regenerate · Adjust Budget · Remove · Swap · Use). Honest low-data banner. Open in Maps reuses Map directions.
- [ ] Build screen + components using design tokens + `DealyCard`.

### Task I6: Entry cards + Food Run + Saved integration
**Files:** Create `Dealy/Views/SmartBasket/SmartBasketEntryCard.swift`, `Dealy/Views/SmartBasket/FoodRunView.swift`; Modify `Dealy/Views/Home/HomeView.swift`, `Dealy/Views/Explore/ExploreView.swift`, `Dealy/Views/Saved/SavedView.swift`.
Entry card at top of Home + section in Explore opens `SmartBasketSetupView` as `fullScreenCover`. Saved baskets section in Saved. FoodRunView entry from Explore.
- [ ] Wire entry points; no regression to existing Home/Explore/Saved.

### Task I7: AppState/setup logic tests
**Files:** Create `DealyTests/SmartBasketTests.swift`.
Test setup→`BasketRequest` mapping, mock generate, save/unsave basket persistence.
- [ ] `xcodegen generate` + build + test.

## Docs Task

### Task D1: Marketplace roadmap
**Files:** Create `docs/DEALY_MARKETPLACE_ROADMAP.md`.
Smart Basket → local commerce evolution; why it beats Facebook Marketplace; build-later list; not-yet list. Per spec §10.
- [ ] Write doc.

## Verification
- Backend: `pnpm typecheck`; `pnpm test -- grocery` (pure specs run without DB).
- iOS: `xcodegen generate` then build + `DealyTests` via `scripts/build.sh test`.
- Confirm existing feeds/map/saved/auth/crawler untouched.

## Self-Review notes
- Spec coverage: §4→B3/B4, §5→B1/B2, §6→B5/B6/B7+I2, §7→I1-I7, §8→I4/I5, §9→specs in each, §10→D1, §12 documented in basket banner (I5) + roadmap.
- Trust labels consistent: `verified|source_backed|estimated|user_reported|mock` across B5 mapper + I1 `TrustLabel` + I2 fallback.
- Endpoint names consistent: `/v1/grocery/baskets/generate|:id/regenerate|:id`, `/v1/feeds/food-run`.
