import Foundation

/// How the map's pins + strip are ordered. Pure, UI-free so it's unit-testable.
enum MapSort: String, CaseIterable, Identifiable, Equatable {
    /// `DealRanker.diversified(DealRanker.rank(...))` — the dollars-first "Best" deck.
    case best
    /// Nearest physical distance first.
    case nearest
    /// Soonest (non-expired) expiration first.
    case endingSoon
    /// Food deals first, then "Best" order within each group.
    case foodFirst

    var id: String { rawValue }

    var label: String {
        switch self {
        case .best: return "Best"
        case .nearest: return "Nearest"
        case .endingSoon: return "Ending soon"
        case .foodFirst: return "Food first"
        }
    }

    var symbol: String {
        switch self {
        case .best: return "sparkles"
        case .nearest: return "location.fill"
        case .endingSoon: return "clock.fill"
        case .foodFirst: return "fork.knife"
        }
    }

    /// Order `deals` per this sort. `ranked` is the already-computed Best order
    /// (diversified rank) — passed in so the caller controls interests/campus.
    func ordered(_ deals: [Deal], ranked: [Deal], reference: Date = Date()) -> [Deal] {
        switch self {
        case .best:
            return ranked
        case .nearest:
            return deals.sorted { a, b in
                if a.distanceMiles == b.distanceMiles { return a.id < b.id }
                return a.distanceMiles < b.distanceMiles
            }
        case .endingSoon:
            // Non-expired soonest-first; expired (if any slipped through) sink last.
            return deals.sorted { a, b in
                let ae = a.expirationDate <= reference
                let be = b.expirationDate <= reference
                if ae != be { return !ae }   // non-expired before expired
                if a.expirationDate == b.expirationDate { return a.id < b.id }
                return a.expirationDate < b.expirationDate
            }
        case .foodFirst:
            // Stable partition: food deals (in Best order) ahead of the rest.
            let food = ranked.filter { $0.category == .food }
            let rest = ranked.filter { $0.category != .food }
            return food + rest
        }
    }
}

/// The sheet's filter selections in one observable, testable value. The view holds
/// one of these; `MapFilterSheet` mutates it; `togglesPass`/`summary`/`isDefault`
/// drive the pins, strip, and the Filter button label. Pure — no SwiftUI here.
///
/// NOTE: radius is intentionally NOT here. It's a top-level map value (the
/// always-visible slider), separate from these sheet filters, so the Filters
/// button label reflects only category/toggles/sort — not how wide the ring is.
struct MapFilterState: Equatable {
    /// Sort options offered in the sheet, in display order.
    static let sortOptions: [MapSort] = [.best, .nearest, .endingSoon]

    var category: DealCategoryFilter = .all
    var sort: MapSort = .best

    /// Deal-type precision toggle. true = exact storefronts only.
    var exactOnly: Bool = false
    /// Require a valid student ID.
    var studentIDRequired: Bool = false
    /// Campus perks only (deals tied to a campus).
    var campusPerksOnly: Bool = false
    /// Only deals that have a real (scraped) image.
    var hasRealImage: Bool = false

    /// True when nothing has been changed from the defaults.
    var isDefault: Bool { self == MapFilterState() }

    /// Count of non-default toggles + selections, used to build `summary`.
    /// Radius is excluded — it's not a sheet filter.
    var activeCount: Int {
        var n = 0
        if category != .all { n += 1 }
        if sort != .best { n += 1 }
        if exactOnly { n += 1 }
        if studentIDRequired { n += 1 }
        if campusPerksOnly { n += 1 }
        if hasRealImage { n += 1 }
        return n
    }

    /// Label for the Filter button (reflects the sheet filters only, never radius).
    /// - default → "Filters"
    /// - exactly one active → a readable summary ("Food", "Nearest", "Exact only"…)
    /// - two or more active → "Filters · N"
    var summary: String {
        let n = activeCount
        if n == 0 { return "Filters" }
        if n >= 2 { return "Filters · \(n)" }
        // Exactly one active selection — describe it directly.
        if category != .all { return category.label }
        if sort != .best { return sort.label }
        if exactOnly { return "Exact only" }
        if studentIDRequired { return "Student ID" }
        if campusPerksOnly { return "Campus perks" }
        if hasRealImage { return "Has image" }
        return "Filters"
    }

    /// Whether `deal` passes the boolean toggles. Category is applied separately,
    /// and radius is the top-level map value (not a sheet filter), so this is the
    /// composable predicate for the boolean toggles only.
    func togglesPass(_ deal: Deal) -> Bool {
        if exactOnly && deal.isApproximateLocation { return false }
        if studentIDRequired && !deal.requiresStudentId { return false }
        if campusPerksOnly && deal.campusSlug == nil { return false }
        if hasRealImage && (deal.imageURL?.isEmpty ?? true) { return false }
        return true
    }

    /// Apply category + toggles to a mappable (already non-online) set. Radius is
    /// applied by the caller (the slider), and ordering by `MapSort.ordered`.
    func apply(to mappable: [Deal]) -> [Deal] {
        DealFilter.byCategoryFilter(mappable, category)
            .filter { togglesPass($0) }
    }
}
