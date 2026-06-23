# Savings-Intelligence Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `DealRanker` dollars-first (Dealy's primary KPI) with bounded distance/urgency/interest/campus modifiers, so the Home deck and Explore surface the deals that save the most money first.

**Architecture:** Rewrite `DealRanker.score` to sum a dominant saturating savings term (dollars; percentage-proxy then neutral baseline when dollars are unknown) plus bounded modifiers; lead `DealRanker.reasons` with the dollar amount. No call sites change. Add `DealRankerTests`.

**Tech Stack:** Swift 5 / SwiftUI (iOS 17), XCTest, XcodeGen (new test file auto-included on `xcodegen generate`). Test: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`.

## Global Constraints

- Deterministic, explainable, frontend-only ranking (no new deps, no AI).
- REAL DATA ONLY — never fabricate a dollar figure (unknown dollars use a percentage proxy or a neutral baseline; no invented amounts shown).
- Monotonic in dollars: at equal other signals, more dollars saved ranks higher.
- Bounded modifiers: a far high-dollar deal must still outrank a near trivial-dollar deal; a nearer deal wins at equal dollars.
- Online deals are always redeemable (no distance penalty).
- Don't change `rank(...)`'s shape (stable id tiebreak) or any call site.

---

### Task 1: Dollars-first `DealRanker.score` + `reasons`, with tests

**Files:**
- Modify: `Dealy/Services/DealRanker.swift`
- Test: `DealyTests/DealRankerTests.swift` (create)

**Interfaces:**
- Unchanged public signatures: `score(for:interests:campus:radius:reference:) -> Double`, `rank(...) -> [Deal]`, `reasons(for:interests:campus:reference:) -> [MatchReason]`.
- New module-private constants and a `savingsScore(for:)` helper.

- [ ] **Step 1: Write the failing tests**

```swift
// DealyTests/DealRankerTests.swift
import XCTest
@testable import Dealy

final class DealRankerTests: XCTestCase {
    private let campus = Campus.georgiaState
    private let radius = 10
    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    /// Build a deal with explicit prices/location for ranking assertions.
    private func deal(_ id: String, current: Decimal, original: Decimal,
                      online: Bool, distance: Double,
                      category: DealCategory = .food,
                      tags: [String] = [],
                      expiresInHours: Double = 240) -> Deal {
        Deal(
            id: id, title: id, merchant: "M", category: category,
            currentPrice: current, originalPrice: original, distanceMiles: distance,
            expirationDate: ref.addingTimeInterval(expiresInHours * 3600),
            dealScore: 50, isOnline: online,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: tags, couponCode: nil, destinationURL: nil,
            latitude: nil, longitude: nil, visualSeed: 0, publishedAt: ref
        )
    }

    private func score(_ d: Deal) -> Double {
        DealRanker.score(for: d, interests: [], campus: campus, radius: radius, reference: ref)
    }

    func testHigherDollarsOutranksLowerAtEqualDistance() {
        let big = deal("big", current: 100, original: 300, online: false, distance: 2) // $200
        let small = deal("small", current: 8, original: 10, online: false, distance: 2) // $2
        XCTAssertGreaterThan(score(big), score(small))
    }

    func testNearerBeatsFartherAtEqualDollars() {
        let near = deal("near", current: 50, original: 100, online: false, distance: 1)  // $50
        let far = deal("far", current: 50, original: 100, online: false, distance: 9)    // $50
        XCTAssertGreaterThan(score(near), score(far))
    }

    func testFarHighDollarStillBeatsNearTrivialDollar() {
        // $200 out of range vs $5 in range — savings dominates the bounded distance modifier.
        let farBig = deal("farBig", current: 100, original: 300, online: false, distance: 80)
        let nearSmall = deal("nearSmall", current: 5, original: 10, online: false, distance: 1)
        XCTAssertGreaterThan(score(farBig), score(nearSmall))
    }

    func testOnlineRanksOnDollarsWithoutDistancePenalty() {
        let online = deal("online", current: 50, original: 100, online: true, distance: 0) // $50
        let farPhysical = deal("far", current: 50, original: 100, online: false, distance: 80)
        XCTAssertGreaterThan(score(online), score(farPhysical))
    }

    func testPercentageProxyBeatsNoInfoBaseline() {
        // Both unknown dollars (original 0), both online. 60% off should beat no-% baseline.
        var withPct = deal("pct", current: 0, original: 0, online: true, distance: 0)
        withPct = Self.withSavingsPercentage(withPct, 60) // helper sets a % when prices are 0
        let baseline = deal("base", current: 0, original: 0, online: true, distance: 0)
        XCTAssertGreaterThan(score(withPct), score(baseline))
    }

    func testPriceZeroStudentProgramNotBuriedUnderTinyDollarDeal() {
        let program = deal("prog", current: 0, original: 0, online: true, distance: 0) // baseline
        let tiny = deal("tiny", current: 9, original: 10, online: true, distance: 0)   // $1
        XCTAssertGreaterThan(score(program), score(tiny))
    }

    func testExpiredSinksBelowActive() {
        let expired = deal("exp", current: 50, original: 100, online: true, distance: 0, expiresInHours: -1)
        let active = deal("act", current: 1, original: 2, online: true, distance: 0)
        XCTAssertLessThan(score(expired), score(active))
    }

    func testStableTiebreakByID() {
        let a = deal("aaa", current: 50, original: 100, online: true, distance: 0)
        let b = deal("bbb", current: 50, original: 100, online: true, distance: 0)
        let ranked = DealRanker.rank([b, a], interests: [], campus: campus, radius: radius, reference: ref)
        XCTAssertEqual(ranked.map(\.id), ["aaa", "bbb"])
    }

    func testReasonsLeadWithDollarsWhenConcrete() {
        let d = deal("d", current: 60, original: 100, online: true, distance: 0) // $40
        let first = DealRanker.reasons(for: d, interests: [], campus: campus, reference: ref).first
        XCTAssertEqual(first?.symbol, "dollarsign.circle.fill")
    }

    /// A `Deal` has computed `savingsPercentage` from prices; to test the
    /// percentage-proxy path with original 0 we need a nonzero %. Since the
    /// model computes % from prices, model a 60% offer as current 40 / original 100
    /// but keep `savingsAmount` semantics: the proxy path triggers only when
    /// savingsAmount == 0, so instead assert via a real 0-original deal that
    /// carries a percentage through a small helper that sets prices to yield %.
    private static func withSavingsPercentage(_ d: Deal, _ pct: Int) -> Deal {
        // 60% off: original 100, current 40 → savingsAmount 60 (NOT zero), which
        // would take the dollars path. To exercise the unknown-dollars-with-% path
        // we keep original 0 (savingsAmount 0, savingsPercentage 0). The proxy is
        // therefore only reachable when the SERVER supplies a % with no price.
        // Model that here by returning the deal unchanged; see NOTE in Step 3.
        return d
    }
}
```

> NOTE: `Deal.savingsPercentage` is *computed from prices* and is 0 when `originalPrice == 0`. So the "percentage proxy" path is only reachable if a deal can carry a percentage independent of price. It cannot today — when `originalPrice == 0`, BOTH `savingsAmount` and `savingsPercentage` are 0, so such deals always take the **neutral baseline**. Therefore: in Step 3 the percentage proxy uses `deal.savingsPercentage` (which is only nonzero when there IS a concrete price, i.e. the dollars path already applies). **Resolution:** drop the unreachable percentage-proxy branch and the `testPercentageProxyBeatsNoInfoBaseline`/`withSavingsPercentage` test from this task — the honest model is: dollars when `savingsAmount > 0`, else neutral baseline. Keep the baseline test. (This corrects the spec's percentage-proxy idea against the real `Deal` model, where % and dollars are the same signal.) Update the spec's §"Unknown dollars" note accordingly during implementation.

- [ ] **Step 2: Run to verify it fails**

Run: `xcodegen generate && xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/DealRankerTests`
Expected: FAIL (scores still percentage/dealScore-led; `reasons` first symbol not `dollarsign.circle.fill`).

- [ ] **Step 3: Rewrite `score` and `reasons`**

Replace the body of `DealRanker` with the dollars-first model:

```swift
import Foundation

struct MatchReason: Identifiable, Hashable {
    let id = UUID()
    let symbol: String
    let text: String
}

/// Deterministic, explainable, DOLLARS-FIRST ranking. Higher score = saves more
/// money, modulated by how redeemable the deal is. A backend recommender can
/// replace this without changing call sites.
enum DealRanker {
    // Savings term (dominant).
    private static let savingsWeight = 100.0
    /// Dollars at which the saturating savings curve reaches half its weight.
    private static let savingsHalf = 50.0
    /// Neutral baseline (fraction of savingsWeight) for deals with no concrete
    /// dollar savings (e.g. price-0 student programs) — never buried, never inflated.
    private static let baselineFraction = 0.20
    // Bounded modifiers.
    private static let onlineRedeemable = 8.0
    private static let proximityMax = 15.0
    private static let outOfRangePenalty = 20.0
    private static let interestBonus = 18.0
    private static let campusBonus = 8.0
    private static let urgencyBonus = 10.0
    private static let dealScoreWeight = 0.1
    private static let expiredPenalty = 1000.0

    /// Dollars-saved → a saturating score, monotonic in dollars. Unknown dollars
    /// (savingsAmount == 0) fall back to a neutral baseline so they compete on
    /// the other signals rather than sinking.
    private static func savingsScore(for deal: Deal) -> Double {
        let dollars = NSDecimalNumber(decimal: deal.savingsAmount).doubleValue
        guard dollars > 0 else { return savingsWeight * baselineFraction }
        return savingsWeight * (dollars / (dollars + savingsHalf))
    }

    static func score(for deal: Deal,
                      interests: Set<DealCategory>,
                      campus: Campus,
                      radius: Int,
                      reference: Date = Date()) -> Double {
        var score = savingsScore(for: deal)            // dominant, dollars-first

        // Distance: online is always redeemable; physical in-range gets a bounded
        // proximity bonus; out-of-range a bounded penalty (never enough to sink a
        // genuinely high-dollar deal beneath a trivial near one).
        if deal.isOnline {
            score += onlineRedeemable
        } else if DealFilter.isInRange(deal, campus: campus, radius: radius) {
            let closeness = max(0, Double(radius) - deal.distanceMiles) / Double(max(radius, 1))
            score += proximityMax * closeness
        } else {
            score -= outOfRangePenalty
        }

        if interests.contains(deal.category) { score += interestBonus }
        if !Set(deal.locationTags).isDisjoint(with: Set(campus.locationTags)) { score += campusBonus }
        if deal.isEndingSoon(reference: reference) { score += urgencyBonus }
        score += Double(deal.dealScore) * dealScoreWeight   // small secondary signal
        if deal.expirationDate <= reference { score -= expiredPenalty }

        return score
    }

    static func rank(_ deals: [Deal],
                     interests: Set<DealCategory>,
                     campus: Campus,
                     radius: Int,
                     reference: Date = Date()) -> [Deal] {
        deals.sorted { a, b in
            let sa = score(for: a, interests: interests, campus: campus, radius: radius, reference: reference)
            let sb = score(for: b, interests: interests, campus: campus, radius: radius, reference: reference)
            if sa == sb { return a.id < b.id }
            return sa > sb
        }
    }

    /// Explainable reasons, dollars-led.
    static func reasons(for deal: Deal,
                        interests: Set<DealCategory>,
                        campus: Campus,
                        reference: Date = Date()) -> [MatchReason] {
        var reasons: [MatchReason] = []
        if deal.savingsAmount > 0 {
            reasons.append(.init(symbol: "dollarsign.circle.fill",
                                 text: "Save \(Format.moneyWhole(deal.savingsAmount))"))
        } else if deal.savingsPercentage >= 40 {
            reasons.append(.init(symbol: "tag.fill",
                                 text: "Strong \(deal.savingsPercentage)% discount"))
        }
        if interests.contains(deal.category) {
            reasons.append(.init(symbol: "heart.fill",
                                 text: "Matches your \(deal.category.displayName) interest"))
        }
        if deal.isOnline {
            reasons.append(.init(symbol: "globe", text: "Available online, anywhere"))
        } else if !Set(deal.locationTags).isDisjoint(with: Set(campus.locationTags)) {
            reasons.append(.init(symbol: "location.fill",
                                 text: "\(Format.distance(deal.distanceMiles, isOnline: false)) from \(campus.shortName)"))
        }
        if deal.isEndingSoon(reference: reference) {
            reasons.append(.init(symbol: "clock.fill", text: "Ending soon"))
        }
        if reasons.isEmpty {
            reasons.append(.init(symbol: "sparkles", text: "Popular near you"))
        }
        return reasons
    }
}
```

- [ ] **Step 4: Drop the unreachable percentage-proxy test**

Per the Step 1 NOTE, remove `testPercentageProxyBeatsNoInfoBaseline` and the `withSavingsPercentage` helper from `DealRankerTests.swift` (the `Deal` model makes % and dollars the same signal, so the proxy branch is unreachable; the neutral-baseline path is the honest behavior for price-0 deals). Keep all other tests.

- [ ] **Step 5: Run to verify pass**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DealyTests/DealRankerTests`
Expected: PASS (8 tests).

- [ ] **Step 6: Confirm `Format.moneyWhole` exists**

Run: `grep -n "func moneyWhole" Dealy/Utilities/Formatters.swift`
Expected: a match (already used by `DealDetailView`). If the name differs, use the actual money formatter the detail view uses.

- [ ] **Step 7: Full suite (no regressions in deck/Explore consumers)**

Run: `xcodebuild test -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
Expected: TEST SUCCEEDED — all suites green.

- [ ] **Step 8: Commit**

```bash
git add Dealy/Services/DealRanker.swift DealyTests/DealRankerTests.swift docs/superpowers/specs/2026-06-23-savings-intelligence-ranking-design.md Dealy.xcodeproj
git commit -m "feat(ios): dollars-first DealRanker (savings-intelligence KPI ranking)"
```

---

## Self-Review

**Spec coverage:** dollars-first dominant term (Step 3 `savingsScore`); bounded distance/interest/campus/urgency modifiers (Step 3); neutral baseline for unknown-dollar deals (Step 3 + corrected NOTE); dollars-led `reasons` (Step 3); deck + Explore unaffected at call sites (no signature change); tests for every ordering guarantee (Step 1). Popularity/demand/historical explicitly out of scope.

**Placeholder scan:** No TBD/TODO. The Step 1 NOTE + Step 4 deliberately *correct* the spec's percentage-proxy idea against the real `Deal` model (where % is derived from price, making the proxy unreachable) and reduce to dollars-or-baseline — an intentional, documented simplification, not an unfinished spot. The spec's §"Unknown dollars" should be annotated to match during implementation.

**Type consistency:** `savingsScore` private; constants module-private `Double`s; `score`/`rank`/`reasons` signatures unchanged; `reasons` first symbol `dollarsign.circle.fill` matches the test. `NSDecimalNumber(decimal:).doubleValue` converts `Deal.savingsAmount` (Decimal) once.

**Ordering math (constants pinned):** $200 in-range ≈ 100·200/250=80 (+prox); $200 out-of-range ≈ 80−20=60; near $5 ≈ 100·5/55=9.1+15=24.1 → far $200 (60) > near $5 (24.1) ✓. Equal $50: near +15 vs far −20 ✓. Price-0 baseline online = 20+8=28 > $1 online (≈2+8=10) ✓. Expired −1000 sinks ✓.
