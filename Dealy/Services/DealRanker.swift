import Foundation

/// A short, human-readable reason a deal surfaced. Not AI — deterministic,
/// explainable, frontend-only ranking that a backend recommender can replace.
struct MatchReason: Identifiable, Hashable {
    let id = UUID()
    let symbol: String
    let text: String
}

/// Deterministic, explainable ranking. Higher score = more relevant.
enum DealRanker {

    /// Compute a relevance score for a deal given the user's context.
    static func score(for deal: Deal,
                      interests: Set<DealCategory>,
                      campus: Campus,
                      radius: Int,
                      reference: Date = Date()) -> Double {
        var score = Double(deal.dealScore)            // 0...100 baseline

        // Interest match is the strongest signal.
        if interests.contains(deal.category) { score += 35 }

        // Proximity: closer (within radius) ranks higher; online is neutral-positive.
        if deal.isOnline {
            score += 8
        } else if DealFilter.isInRange(deal, campus: campus, radius: radius) {
            let closeness = max(0, Double(radius) - deal.distanceMiles) / Double(max(radius, 1))
            score += 20 * closeness
        } else {
            score -= 40   // out of range: strongly demoted
        }

        // Discount strength.
        score += min(Double(deal.savingsPercentage) * 0.3, 20)

        // Urgency nudge (without burying everything else).
        if deal.isEndingSoon(reference: reference) { score += 10 }
        if deal.expirationDate <= reference { score -= 100 }

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

    /// Up to a few explainable reasons for the detail/info UI.
    static func reasons(for deal: Deal,
                        interests: Set<DealCategory>,
                        campus: Campus,
                        reference: Date = Date()) -> [MatchReason] {
        var reasons: [MatchReason] = []
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
        if deal.savingsPercentage >= 40 {
            reasons.append(.init(symbol: "tag.fill",
                                 text: "Strong discount for \(deal.category.displayName.lowercased())"))
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
