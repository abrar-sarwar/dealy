# Dealy Marketplace Roadmap

> How Smart Basket evolves into student-first local commerce — and why Dealy can
> be a safer, cleaner alternative to Facebook Marketplace.
> Status: directional roadmap. **No marketplace code exists yet and none should be
> built until the gates below are met.** This document exists so the Smart Basket
> architecture is built in a marketplace-compatible direction, not so we start
> building a marketplace now.

## 1. The thesis

Dealy's north star: **the app students open before spending money nearby.**

Today that means *discovery* — "what should I buy / cook / eat / do, and where, for
how much." Smart Basket is the first feature that doesn't just *list* options, it
*decides* for the student (budget in → basket + store + total + why out).

The same decision engine, location graph, trust model, and student-verified
audience that power "where should I buy groceries" are the foundation for "who
nearby is selling the thing I need." That is the bridge from a deals app to a
**local commerce graph**.

## 2. How Smart Basket evolves into a marketplace

The progression reuses assets at every step — we never build the marketplace from
scratch:

| Stage | What ships | Reused from prior stage |
|---|---|---|
| **A. Smart Basket (now)** | Budget → auto basket → best store → total → why | Region/coverage graph, Places, deal trust model, Gemini explanations |
| **B. Demand signal** | "Most requested grocery items / basket goals" + ISO ("I'm looking for…") capture | Basket goals + item catalog as a structured intent vocabulary |
| **C. Supply intake (curated)** | Operator/merchant-listed surplus & student offers ("moving-out deals", campus resell drops) | Listing shape mirrors `GroceryDealMatch` trust fields; moderation reuses crawler/admin patterns |
| **D. Peer listings (campus-gated)** | Verified students post items; buyers browse with the same ranked-feed UX | Saved baskets/deals → saved listings; map pins → pickup zones; recommendation engine → listing ranking |
| **E. Local commerce graph** | Two-sided: intent (ISO/baskets) matched to supply (listings/merchants), priced by nearby-value signals | Everything above + accumulated redemption/visit/transaction data |

The key insight: **a basket item the catalog can't price cheaply is a demand
signal.** "47 students near GSU wanted a cheap mini-fridge this week" is exactly
the input a marketplace needs. Smart Basket generates that data as a byproduct.

## 3. Why this beats Facebook Marketplace

Facebook Marketplace wins on liquidity and loses on trust, signal, and fit for
students. Dealy's wedge is the inverse:

- **Student-first & campus-verified.** Listings scoped to a verified campus
  audience — not the open internet. Fewer scammers, more relevant inventory
  (textbooks, dorm gear, moving-out bundles) at the right moments (move-in,
  finals, move-out).
- **Safer meetups.** Suggested safe, public, on/near-campus meetup spots instead of
  "come to my apartment." Pickup zones, not exact addresses.
- **Cleaner listings.** Structured fields (condition, category, pickup zone) +
  AI-assisted listing quality and de-spam, instead of free-text chaos.
- **Better search & recommendations.** The same ranked-feed + "decide for me"
  engine ("best value mini-fridge within 1 mile under $40") rather than keyword
  soup.
- **Smarter pricing.** Suggest a fair price from nearby comparable value signals so
  students don't over/under-price.
- **Less spam, real moderation.** Reputation, report flows, and stale-listing
  cleanup are first-class — reusing the existing admin/moderation foundation.
- **ISO / request posts.** "I'm looking for a TI-84" creates demand the supply side
  can answer — a primitive Facebook Marketplace lacks.

We do **not** try to beat Facebook on raw liquidity. We win a bounded, high-trust,
high-relevance niche (one campus) and expand campus by campus — the same
zone-by-zone playbook as the deals product.

## 4. Future marketplace categories

textbooks · dorm items · furniture · electronics · clothes · event tickets ·
study supplies · calculators · bikes/scooters · moving-out deals · free stuff ·
roommate bundles · local services.

## 5. What to build later (scaffold when gates are met)

These are intentionally **not built yet**. When built, they should follow the
Smart Basket conventions (UUID PKs, snake_case `@map`, trust labels, `@Public()`
where pre-auth, deterministic engine + optional AI):

- **Listing model** — mirrors `GroceryDealMatch`/`Deal` trust fields
  (`source`, `confidence`, `last_verified_at`, `trust_label`).
- **Seller profile + reputation** — depends on real iOS auth (not present yet).
- **Campus verification** — compliant student-status provider (`.edu`/SHEERID-style).
- **Item condition** enum + structured listing fields.
- **Pickup location zone** (not exact address) + **safe meetup spots** dataset
  (reuse Places + coverage).
- **Price recommendation** — extend `BasketRecommendationService` scoring to
  comparable-value pricing.
- **Listing quality score** & **scam risk score** — reuse Gemini enrichment +
  moderation patterns.
- **Saved search** & **ISO/request posts** — extend saved-baskets persistence.
- **Bundles** (roommate/moving-out) — extend basket grouping.
- **Student-only visibility**, **report listing**, **expired/stale cleanup** —
  reuse admin/moderation + expiry jobs.

## 6. What NOT to build yet (and why)

- **Any peer-to-peer listing flow** — blocked on real iOS auth + identity. Building
  it now would create unused tables that rot (the very anti-pattern the master
  overview warns about).
- **Payments / escrow** — out of scope until liquidity and trust are proven;
  introduces heavy compliance burden.
- **Open (non-campus) marketplace** — abandons the trust wedge; that's just a worse
  Facebook Marketplace.
- **Seller tooling / merchant SaaS** — premature before two-sided demand exists.
- **Empty "Marketplace" tab** — do not ship a hollow placeholder. A "Nearby Finds"
  surface should appear only once there is real, non-fake inventory to show.

## 7. Gates before starting marketplace code

Do not write marketplace models/endpoints/screens until **all** of these hold:

1. Real iOS authentication + identity exists (required for sellers/reputation).
2. Smart Basket + deals show a retained cohort in one campus zone (people return).
3. Demand signal is real — measurable ISO/most-requested-item volume.
4. A moderation owner + workflow exists (reuse admin) to keep listings clean.
5. At least one campus has enough verified students to seed a trustworthy
   two-sided pool.

Until then: keep making the *discovery + decide-for-me* loop (Smart Basket, Cheap
Food Run, deals, Places) genuinely useful. That is what earns the right to become a
marketplace.
