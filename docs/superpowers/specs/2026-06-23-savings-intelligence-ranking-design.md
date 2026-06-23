# Savings-Intelligence Ranking Design

**Date:** June 23, 2026
**Status:** Approved for implementation planning
**Scope:** iOS only. Re-rank the feed around **dollars saved** (Dealy's primary KPI) instead of discount percentage, with distance/urgency/interest/campus as bounded modifiers. Upgrades the existing `DealRanker`, which already powers the Home swipe deck and Explore.

## Product goal

Dealy's success metric is **Total Dollars Saved By Students** — "what is the best
way for this student to save money right now?" Today `DealRanker` leads with the
server `dealScore` and treats discount *percentage* as a minor term. This makes
the ranking dollars-first: the deal that saves the most money, weighted by how
redeemable it is, ranks highest.

Governing rules: deterministic, explainable, frontend-only ranking (a backend
recommender can later replace it); REAL DATA ONLY (never fabricate a savings
figure).

## Scope boundary

**Delivers:** a dollars-first `DealRanker.score`/`rank`/`reasons`, applied
automatically wherever `DealRanker` already runs (`HomeFeedViewModel` deck,
`ExploreViewModel`, `ExploreView`), plus `DealRankerTests`.

**Does NOT deliver:** popularity, demand, or historical-performance signals (from
the original spec) — they require backend interaction aggregates the client
cannot read yet. The dollars-saved analytics events already emitted feed them,
but there is no read-back API; documented as a future extension. No backend
change. No change to the explicit user sort options (distance / ending-soon) in
the filter sheet — only the default "recommended" order.

## Architecture

All in `Dealy/Services/DealRanker.swift` (pure, deterministic, no new deps).

### Scoring model (`score(for:interests:campus:radius:reference:)`)

Score is a sum of one dominant savings term plus bounded modifiers:

1. **Savings term (dominant).** Estimated dollars saved → a saturating score so
   the order is monotonic in dollars but one outlier can't dwarf everything:
   `savingsScore = SAVINGS_WEIGHT * (dollars / (dollars + SAVINGS_HALF))`
   where `SAVINGS_HALF ≈ 50` (a $50 saving earns half the max savings weight; $200
   earns ~80%). `SAVINGS_WEIGHT ≈ 100` so savings dominates the modifiers below.
   - **Unknown dollars** (`savingsAmount == 0`): if `savingsPercentage > 0`, use a
     percentage proxy `SAVINGS_WEIGHT * (pct/100) * PCT_PROXY` (`PCT_PROXY ≈ 0.6`,
     so a strong % reads as a solid-but-not-top saving). If neither exists, a
     **neutral baseline** `SAVINGS_WEIGHT * BASELINE_FRACTION` (`≈ 0.35`) so
     price-0 student programs sit mid-pack and compete on other signals.
2. **Distance modifier (bounded, ±).** Online → `+ONLINE_REDEEMABLE` (small
   positive; always redeemable). Physical in-range → up to `+PROXIMITY_MAX`
   scaled by closeness. Physical out-of-range → `−OUT_OF_RANGE_PENALTY`
   (bounded; cannot sink a high-dollar deal beneath a trivial near one).
3. **Interest match:** `+INTEREST_BONUS` when `interests.contains(category)`.
4. **Campus relevance:** `+CAMPUS_BONUS` when `deal.locationTags ∩ campus.locationTags`.
5. **Urgency:** `+URGENCY_BONUS` if ending soon.
6. **Server `dealScore`:** `+ dealScore * DEALSCORE_WEIGHT` (small secondary).
7. **Expired:** `−EXPIRED_PENALTY` (large) when past expiry.

Constants are module-private, named, and tuned so: (a) higher dollars always wins
at equal other signals; (b) `PROXIMITY_MAX`/`OUT_OF_RANGE_PENALTY` are small
enough that a far $200 deal still outranks a near $5 deal; (c) a near deal beats a
far one at equal dollars.

### Ranking (`rank(...)`)

Unchanged shape: sort by `score` desc, stable id tiebreak. Already consumed by
the deck and Explore.

### Explainability (`reasons(...)`)

Leads with money: when `savingsAmount > 0`, first reason is "Save \(money)"; else
when `savingsPercentage >= 40`, "Strong N% discount"; then proximity (distance
from campus / "available online"), interest, urgency. Keeps the existing
`MatchReason` shape so the detail view's "why you're seeing this" is unchanged
structurally.

## Data flow

```
HomeFeedViewModel.rebuild → DealRanker.rank(unseen, interests, campus, radius) → deck  (then user sort)
ExploreViewModel / ExploreView.results → DealRanker.rank(...)
DealDetailView → DealRanker.reasons(...)  (now dollars-led)
```

No call sites change; only the scoring/reasons internals.

## Error handling / edge cases

- `originalPrice == 0` → `savingsAmount == 0` → percentage-proxy or neutral
  baseline path (no divide-by-zero; `savingsPercentage` already guards).
- Negative/zero dollars never produce a negative savings term (clamped at the
  baseline).
- Expired deals are heavily penalized but still orderable (no crash).
- Empty input → empty output.

## Testing (`DealyTests/DealRankerTests.swift`, new)

- Higher dollars outranks lower dollars at equal distance/category.
- At equal dollars, a nearer physical deal outranks a farther one.
- A far high-dollar deal ($200, out of range) still outranks a near tiny-dollar
  deal ($5, in range) — bounded distance modifier.
- An online deal ranks on dollars and is not distance-penalized.
- Unknown-dollar deal with `savingsPercentage = 60` outranks an unknown-dollar
  deal with no price info (neutral baseline).
- A price-0 student program (baseline) is NOT buried beneath a $1-savings deal.
- Expired deal sinks below all active deals.
- Stable id tiebreak for equal scores.
- `reasons` leads with "Save $X" when a concrete amount exists; with the
  percentage reason when only a percentage exists.

## Out of scope (explicit)

- Backend ranking / SQL `sort_key` changes.
- Popularity / demand / historical-performance signals (need a backend
  read-back API).
- Changing the explicit user sort options.
- Any UI layout change (reasons keep their existing presentation).
