# Food Run v2 — Restaurant Decision Engine (Design + Plan)

> Date: 2026-06-27
> Status: Approved direction (extends the existing Food Run). Builds on Smart Basket.
> Goal: make Dealy the app students open before eating out — "I'm hungry and trying
> not to waste money. Where should I eat right now?" Restaurant version of Smart Basket.

## 1. What exists (extend, do not duplicate)

`POST /v1/feeds/food-run` (`backend/src/grocery/food-run.service.ts`) already:
picks ONE best place by `intent` (7 intents), scores from stored Place fields
(affordability/cheapEats/studentValue/hiddenGem scores, vibeTags, rating,
priceBucket, budgetTip, whyRecommended), matches a nearby food `Deal`, sets
confidence + source_status, pure `rankPlaces()` unit-tested. iOS `FoodRunView`
shows intent chips + one result card; entry only from Explore.

This stays. We extend the request, response, scoring, and UI.

## 2. Wire contract (Food Run v2) — backend + iOS must match exactly

### Request (`POST /v1/feeds/food-run`)
```json
{
  "latitude": 33.753, "longitude": -84.386, "region": "atl-downtown",
  "goal": "under_10", "budget": 10, "maxDistanceMiles": 2,
  "dietary": ["halal","high_protein"], "timeOfDay": "lunch",
  "vibe": "quick", "allowChains": true, "allowLocal": true
}
```
- `goal` ∈ under_10 | cheapest | high_protein | quick_lunch | late_night |
  study_spot | coffee_dessert | date_friends | group_meal | best_value |
  pickup_deal | student_friendly | custom. (Accept legacy `intent` as alias.)
- `timeOfDay?` ∈ morning | lunch | afternoon | dinner | late_night
- `vibe?` ∈ quick | filling | healthy | comfort | social | quiet
- `dietary?[]` ∈ vegetarian | halal | high_protein | healthy
- `budget?` dollars; `maxDistanceMiles?`; `allowChains?`/`allowLocal?` default true.

### Response (`FoodRunDto`)
```json
{
  "place": {
    "id","name","category","price_bucket","rating","latitude","longitude",
    "why_recommended","budget_tip","primary_photo_url",
    "distance_miles": 0.4, "tags": ["under $10","good for students"]
  },
  "ranked_alternatives": [ { same place shape } ],
  "estimated_cost": 9.0,
  "recommended_order": "Get the falafel wrap",
  "reason": "Filling, close, highly rated, and usually under $10.",
  "ranking_label": "Best under $10",
  "matched_deal": { "merchant","title","discount","price","valid_until",
                    "source","last_verified_at","confidence","source_url" } ,
  "confidence": "high",
  "tags": ["under $10","good for students","high protein"],
  "source_status": "estimated"
}
```
- `ranking_label` ∈ Best overall | Cheapest nearby | Best under $10 | Worth the walk
  | Good study spot | Best late-night move | Skip today if too expensive.
- `confidence` ∈ low | medium | high. `source_status` ∈ verified | source_backed |
  estimated | mock. `recommended_order` derives from the place budgetTip; null ok.
- `place` may be null only when no places at all; otherwise always best available.

## 3. Scoring (improve `food-run.service.ts`)

Keep goal-specific weighting as the primary signal; blend with general factors:

```
restaurant_score =
    budgetFitScore     * 0.20
  + (rating/5)         * 0.18
  + distanceScore      * 0.16
  + studentValueScore  * 0.16
  + dealMatchScore     * 0.12
  + openNowScore       * 0.10
  + goalAffinityScore  * 0.08
  - expensivePenalty            // 0.15 when est. cost > budget (or > $25 if no budget)
  - lowConfidencePenalty        // 0.10 when not enriched / outside region
```
- `goalAffinityScore` = the existing per-goal weighting (extended to the new goals:
  cheapest→affordability+cheapEats; coffee_dessert→category cafe + dessert tags;
  group_meal→filling/shareable tags + affordability; best_value→rating×affordability;
  pickup_deal→dealLikelihood + has deal; student_friendly→studentValue + curated flag).
- `openNowScore`: **honest** — no store hours exist. Derive a heuristic from
  `timeOfDay` + late/breakfast tags; default neutral 0.5 when unknown. Documented
  as estimated, never claimed as real "open now".
- `budgetFitScore`: 1 when est. cost ≤ budget, decays above; 0.5 neutral if no budget.
- `distanceScore`: 1 near, decays to maxDistanceMiles (default 10).
- Filters: drop places beyond `maxDistanceMiles`; respect `allowChains`/`allowLocal`
  (chain heuristic by known-chain name list); soft-filter by `dietary` tags.

`ranking_label` chosen from goal + result (e.g. under_10 & est≤10 → "Best under $10";
est > budget for all → "Skip today if too expensive"; far but top → "Worth the walk").

`tags` derived from place fields: "under $10" (est≤10), "good for students"
(studentValue≥0.6 or curated), "late night"/"high protein"/"healthy"/"quiet study"
from vibe/category tags, "has deal" when matched.

## 4. Trust (unchanged principle)

No fake restaurant deals. A place with no verified coupon is still recommended on
value + estimated budget, labeled `estimated` (source_status) with the budget tip —
never shown as a verified deal. Only a real published food `Deal` → `source_backed`/
`verified`.

## 5. Data sources

Now: Google Places (stored), Gemini budget tips (stored), category price estimates,
admin-curated student-friendly places (new `Place.curatedStudentFriendly` flag).
Future (documented, not built): promo emails, Toast/Square/Popmenu menus, user
receipts/deals, merchant partnerships, happy-hour & student-night pages.

## 6. Schema change

Migration `..._food_run_curation`: add `Place.curatedStudentFriendly Boolean
@default(false) @map("curated_student_friendly")`. No other tables touched. Seed a
few flagged places where sensible.

## 7. iOS

- Expand `FoodRunIntent` → add all goals; add `FoodRunRequest` fields (goal, budget,
  maxDistance, dietary, timeOfDay, vibe, allowChains, allowLocal).
- Extend `FoodRunResult`: `alternatives: [Place]`, `tags: [String]`,
  `rankingLabel: String?`, `recommendedOrder: String?`, plus `distanceMiles` on Place.
- New `FoodRunSetupView` (chip quiz: goal chips → optional budget/distance/vibe → Go),
  mirroring `SmartBasketSetupView`; richer `FoodRunResultView` (selected place card
  with tags + ranking label + confidence + why + recommended order + deal + distance,
  ranked alternatives list, CTAs: Directions/Open in Maps · Save place/deal ·
  Regenerate). `FoodRunView` becomes the setup→result coordinator.
- Entry points: Food Run card on **Home** (new) + Explore Cheap Eats section
  (existing). Decision cards: "Best lunch move today" / "Under $10 near you" on
  Home/Explore that deep-link Food Run with a preset goal.
- Save place/deal → persisted `savedPlaces` (local, like savedBaskets/saved deals),
  surfaced in **Saved**. Show result on map via existing Directions/Map.
- Out-of-area: still returns best nearby place + estimated budget tip, lower
  confidence + honest copy.

## 8. Tests

- Backend Jest: new-goal scoring picks expected place; budget/distance filters;
  ranking_label + tags + alternatives in response; expensive→"Skip today";
  out-of-area path. Keep existing 4 passing.
- iOS XCTest: FoodRunDTO v2 mapping (tags, alternatives, ranking_label, fallbacks);
  setup→request mapping; mock returns enriched result; save place persistence.

## 9. Docs & deliverables

`docs/DEALY_FOOD_RUN_LOGIC.md`: the restaurant recommendation logic, scoring,
labels/tags, real-vs-estimated. End summary: what changed, files, endpoint shape,
real vs estimated, next steps (incl. Supabase provisioning note).

## 10. Plan / task order

Backend: B1 schema flag + migration → B2 expand DTOs (request+response) + mapper →
B3 improve scoring + ranking_label + tags + alternatives + filters in
food-run.service + spec → B4 controller passthrough of new fields → B5 openapi.
iOS: I1 models/enums expand → I2 DTO mapping + tests → I3 setup + result views →
I4 entry cards + decision cards + Home wiring + Saved/savedPlaces → I5 tests.
Docs: D1 food run logic doc.
Verify: backend typecheck + grocery/food-run tests; iOS xcodegen + build + tests.
