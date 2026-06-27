# Food Run — Restaurant Recommendation Logic

> How Dealy answers: "I'm hungry and trying not to waste money. Where should I eat
> right now?" Food Run is the restaurant counterpart to Smart Basket — it decides,
> it doesn't just list. Endpoint: `POST /v1/feeds/food-run`.

## 1. Inputs

The user taps chips (no typing required):
- **goal** (required): under_10 · cheapest · high_protein · quick_lunch · late_night
  · study_spot · coffee_dessert · date_friends · group_meal · best_value ·
  pickup_deal · student_friendly · custom.
- **budget** (optional $), **maxDistanceMiles** (walking/5 min/10 min/custom),
  **dietary** (vegetarian/halal/high_protein/healthy), **timeOfDay**
  (morning/lunch/afternoon/dinner/late_night), **vibe**
  (quick/filling/healthy/comfort/social/quiet), **allowChains**, **allowLocal**.

Location comes from the device (lat/lng) and resolves to the nearest region. Out of
region still works (see §6).

## 2. Candidate places

Reuses the existing Places data (Google Places + Gemini enrichment, stored — no live
AI on request). Each place carries: rating, priceBucket, affordability/cheapEats/
studentValue/hiddenGem/dealLikelihood scores, vibeTags, categoryTags, bestFor,
whyRecommended, budgetTip, photo, and the new `curatedStudentFriendly` flag.

## 3. Scoring

A place's `restaurant_score` blends a general value model with the chosen goal:

```
restaurant_score =
    budgetFit       * 0.20
  + (rating/5)      * 0.18
  + distanceScore   * 0.16
  + studentValue    * 0.16     (curated student-friendly → boosted)
  + dealMatch       * 0.12
  + openNow         * 0.10     (honest heuristic — see below)
  + goalAffinity    * 0.08     (per-goal weighting, all 13 goals)
  - expensivePenalty           (0.15 when est. cost > budget, or > $25 if no budget)
  - lowConfidencePenalty       (0.10 when outside region / not enriched)
  + dietaryBonus               (soft, ≤0.06 — never excludes)
```

- **budgetFit**: 1.0 if estimated cost ≤ budget, decays above; 0.5 when no budget.
- **distanceScore**: 1.0 nearby → 0 at `maxDistanceMiles` (default 10). Places beyond
  the max are filtered out (then unfiltered as a fallback so a result always exists).
- **estimated cost** by price bucket: `$`→$8, `$$`→$15, `$$$`→$30, `$$$$`→$50,
  unknown→$12.
- **openNow**: Dealy does **not** store store hours. This is an honest heuristic from
  `timeOfDay` + late-night/breakfast tags (neutral 0.5 when unknown). It is never
  presented to the user as a verified "open now" signal.
- **chains/local**: `allowChains=false` drops known chains (substring match against a
  curated chain list); `allowLocal=false` drops non-chains.
- **dietary**: a soft bonus from vibe/category tags — it nudges, it never hard-filters
  (so you still get a result when data is sparse).

The top place is "Best overall" for the goal; the next 3–5 become
`ranked_alternatives` ("More options nearby").

## 4. Ranking labels & tags

**ranking_label** (one, headline): Best overall · Cheapest nearby · Best under $10 ·
Worth the walk (>1.5 mi but top) · Good study spot · Best late-night move · **Skip
today if too expensive** (when even the best beats the budget).

**tags** (multiple, descriptive, derived from place fields): "under $10",
"good for students", "high protein", "healthy", "late night", "quiet study",
"highly rated", "has deal".

**recommended_order**: the place's stored Gemini budget tip (e.g. "Get the falafel
wrap") — null when none exists.

## 5. Trust — real vs estimated

| Signal | Meaning |
|---|---|
| `source_status: source_backed` / `verified` | A real published food **Deal** matched this place (coupon/promo). |
| `source_status: estimated` | No verified deal — recommendation is value + budget-tip + Places data. The honest default. |
| `matched_deal` present | A real `Deal` (merchant, discount, price, valid_until, last_verified_at, source_url). |
| `confidence: high/medium/low` | high = in region + close + enriched; low = out of region / sparse data. |

**We never fabricate restaurant deals.** A place with no coupon is still recommended,
but it's clearly an "estimated meal / budget tip", not a verified deal.

## 6. Out-of-coverage behavior

If the user isn't in a covered region, Food Run still returns the best nearby Places
with estimated budget tips — flagged **low confidence** and `estimated`. It never
returns "nothing"; it's honest about certainty.

## 7. Data sources

**Now:** Google Places (stored), Gemini budget tips (stored), category price
estimates, admin-curated student-friendly places (`curatedStudentFriendly`).
**Future (not built):** restaurant promo emails, Toast/Square/Popmenu menu pages,
user-submitted receipts/deals, merchant partnerships, happy-hour & student-night
pages. These plug into `matched_deal` / scoring without changing the contract.

## 8. iOS surface

- Entry: Food Run card on **Home** + Cheap Eats in **Explore**; decision cards
  ("Best lunch move today" → quick_lunch, "Under $10 near you" → under_10) deep-link
  with a preset goal.
- Flow: `FoodRunSetupView` (chip quiz) → `FoodRunResultView` (best place + tags +
  ranking label + confidence + why + recommended order + deal + distance + ranked
  alternatives + Directions / Save place / Regenerate).
- Save place → local `savedPlaces` (UserDefaults), shown in **Saved** (auth-synced
  later, like saved baskets/deals).
