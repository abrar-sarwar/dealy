import Foundation

/// A short, human-readable reason a deal surfaced. Not AI — deterministic,
/// explainable, frontend-only ranking that a backend recommender can replace.
struct MatchReason: Identifiable, Hashable {
    let id = UUID()
    let symbol: String
    let text: String
}

/// Deterministic, explainable, DOLLARS-FIRST ranking. Higher score = saves more
/// money, modulated by how redeemable the deal is. Dealy's primary KPI is total
/// dollars saved, so estimated savings is the dominant term; distance, interest,
/// campus relevance, and urgency are bounded modifiers. A backend recommender can
/// replace this without changing call sites.
enum DealRanker {
    // Savings term (dominant).
    private static let savingsWeight = 100.0
    /// Dollars at which the saturating savings curve reaches half its weight, so
    /// order is monotonic in dollars without one outlier dwarfing every signal.
    private static let savingsHalf = 50.0
    /// Neutral baseline (fraction of `savingsWeight`) for deals with no concrete
    /// dollar savings (e.g. price-0 student programs) — never buried, never
    /// inflated, no fabricated dollar figure.
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

    /// Dollars-saved → a saturating score, monotonic in dollars. When the dollar
    /// amount is unknown (`savingsAmount == 0`, e.g. price-0 student programs or
    /// "free with ID"), fall back to a neutral baseline so the deal competes on
    /// the other signals rather than sinking. (The `Deal` model derives
    /// `savingsPercentage` from price, so a percentage is only nonzero when there
    /// is already a concrete dollar amount — there is no separate percentage-only
    /// signal to proxy from.)
    private static func savingsScore(for deal: Deal) -> Double {
        let dollars = NSDecimalNumber(decimal: deal.savingsAmount).doubleValue
        guard dollars > 0 else { return savingsWeight * baselineFraction }
        return savingsWeight * (dollars / (dollars + savingsHalf))
    }

    /// Compute a relevance score for a deal given the user's context.
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

    /// Rank deals best-first. Stable for equal scores via id tiebreak.
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

    /// Up to a few explainable reasons for the detail/info UI, dollars-led.
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
