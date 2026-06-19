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
}
