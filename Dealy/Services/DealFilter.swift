import Foundation

/// Pure, testable filtering primitives shared by every screen. No UI state here.
enum DealFilter {

    /// Keep deals in `category`, or all when `category` is nil.
    static func byCategory(_ deals: [Deal], category: DealCategory?) -> [Deal] {
        guard let category else { return deals }
        return deals.filter { $0.category == category }
    }

    /// A deal is in range for a campus when it's online (always available) OR
    /// it shares a location tag with the campus AND is within the radius.
    static func isInRange(_ deal: Deal, campus: Campus, radius: Int) -> Bool {
        if deal.isOnline { return true }
        let tagMatch = !Set(deal.locationTags).isDisjoint(with: Set(campus.locationTags))
        return tagMatch && deal.distanceMiles <= Double(radius)
    }

    static func byLocation(_ deals: [Deal], campus: Campus, radius: Int) -> [Deal] {
        deals.filter { isInRange($0, campus: campus, radius: radius) }
    }

    /// Case/diacritic-insensitive match across title, merchant, category, and blurb.
    static func search(_ deals: [Deal], query: String) -> [Deal] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return deals }
        return deals.filter { deal in
            [deal.title, deal.merchant, deal.category.displayName, deal.shortDescription]
                .contains { $0.range(of: trimmed, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
        }
    }

    /// Exclude expired deals.
    static func active(_ deals: [Deal], reference: Date = Date()) -> [Deal] {
        deals.filter { $0.expirationDate > reference }
    }

    /// Discovery-aware eligibility over already-loaded inventory.
    ///
    /// - Anywhere: active online-only deals.
    /// - Nearby: active local deals within the radius lead, followed by online
    ///   deals capped at 30% of the resulting page (see `blendNearby`).
    static func byDiscovery(
        _ deals: [Deal],
        preference: DiscoveryPreference,
        reference: Date = Date()
    ) -> [Deal] {
        let live = active(deals, reference: reference)
        switch preference.mode {
        case .anywhere:
            return live.filter(\.isOnline)
        case .nearby:
            let local = live.filter { !$0.isOnline && $0.distanceMiles <= Double(preference.radiusMiles) }
            let online = live.filter(\.isOnline)
            return blendNearby(local: local, online: online)
        }
    }

    /// Local deals first, then online deals capped so online is at most ~30% of
    /// the blended page. With L local and O online used, O/(L+O) ≤ 0.30 means
    /// O ≤ floor(3/7 · L). When there are no local deals, returns nothing online
    /// so a Nearby feed never silently becomes online-only.
    static func blendNearby(local: [Deal], online: [Deal]) -> [Deal] {
        guard !online.isEmpty, !local.isEmpty else { return local }
        let maxOnline = Int((Double(local.count) * 3.0 / 7.0).rounded(.down))
        return local + online.prefix(maxOnline)
    }

    static func advanced(
        _ deals: [Deal],
        filters: DealFeedFilters,
        reference: Date = Date()
    ) -> [Deal] {
        deals.filter { deal in
            let price = NSDecimalNumber(decimal: deal.currentPrice).doubleValue
            guard price >= filters.minPrice, price <= filters.maxPrice else { return false }
            if filters.onlineOnly && !deal.isOnline { return false }
            if filters.endingSoonOnly && !deal.isEndingSoon(reference: reference) { return false }
            if filters.strongDiscountOnly && deal.savingsPercentage < 40 { return false }
            return true
        }
    }
}
