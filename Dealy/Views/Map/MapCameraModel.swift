import CoreLocation
import MapKit

/// Pure, UI-free helpers backing `DealsMapView`. Kept free of SwiftUI/AppState so
/// the camera framing, radius counts, caption text, and composed filtering are all
/// unit-testable without instantiating a live `Map`.
enum MapCameraModel {

    /// Radius options (miles) offered by the on-map "expand to see more" control.
    /// These are subsets of the already-loaded 15mi feed — selecting one never
    /// triggers a refetch; it only reframes + filters.
    static let radiusOptions: [Int] = [1, 3, 5, 10]

    /// Hard ceiling on the camera span's diagonal (≈ degrees of latitude). 12 miles
    /// ≈ 0.174° — this guarantees the map never opens at full-metro scale even when
    /// the selected radius is wide or a stray outlier is present.
    static let maxSpanDegrees: Double = 12.0 / 69.0

    // MARK: Distance / filtering

    /// Physical (non-online), still-active deals — the universe the map draws from.
    static func mappable(_ deals: [Deal], reference: Date = Date()) -> [Deal] {
        DealFilter.active(deals, reference: reference)
            .filter { !$0.isOnline }
            .sorted { $0.distanceMiles < $1.distanceMiles }
    }

    /// Deals within `radiusMiles` of the user.
    static func within(_ deals: [Deal], radiusMiles: Int) -> [Deal] {
        deals.filter { $0.distanceMiles <= Double(radiusMiles) }
    }

    /// Compose category + radius filtering over a mappable set (already non-online).
    /// food@3mi = food deals within 3 miles.
    static func filtered(
        _ deals: [Deal],
        category: DealCategoryFilter,
        radiusMiles: Int
    ) -> [Deal] {
        within(DealFilter.byCategoryFilter(deals, category), radiusMiles: radiusMiles)
    }

    /// Live deal count for each radius option, computed from already-loaded deals.
    /// Returned in the same order as `radiusOptions`.
    static func counts(
        for deals: [Deal],
        category: DealCategoryFilter = .all
    ) -> [(radius: Int, count: Int)] {
        let scoped = DealFilter.byCategoryFilter(deals, category)
        return radiusOptions.map { r in (r, within(scoped, radiusMiles: r).count) }
    }

    /// Count of deals within a single radius (for one chip label).
    static func count(
        for deals: [Deal],
        radiusMiles: Int,
        category: DealCategoryFilter = .all
    ) -> Int {
        filtered(deals, category: category, radiusMiles: radiusMiles).count
    }

    /// The smallest radius option that is non-sparse (count ≥ `target`) and — when the
    /// area has any food deals at all — actually includes one, so "Food" is never 0 by
    /// default (local food is the hero of local discovery). Falls back to the widest
    /// option. Example: at GSU the nearest food is ~1.6mi, so this opens at 3mi (with
    /// restaurants) rather than 1mi (grocery/campus only); at GT food is <1mi so it
    /// stays tight.
    static func defaultRadius(
        for deals: [Deal],
        target: Int = 6,
        reference: Date = Date()
    ) -> Int {
        let mappableDeals = mappable(deals, reference: reference)
        let hasFood = mappableDeals.contains { $0.category == .food }
        for r in radiusOptions {
            let inRange = within(mappableDeals, radiusMiles: r)
            let includesFood = !hasFood || inRange.contains { $0.category == .food }
            if inRange.count >= target && includesFood { return r }
        }
        return radiusOptions.last ?? 5
    }

    // MARK: Camera

    /// Span for a given display radius, clamped so the diagonal never exceeds the
    /// hard max-span cap. The base span shows the full ring plus a little margin
    /// (radius × 2 × 1.25 ≈ 2.5× radius across), converted miles→degrees.
    static func span(forRadiusMiles radius: Int) -> MKCoordinateSpan {
        let miles = Double(radius)
        let base = (miles * 2.5) / 69.0           // diameter + margin, in degrees lat
        let delta = min(max(base, 0.02), maxSpanDegrees)
        return MKCoordinateSpan(latitudeDelta: delta, longitudeDelta: delta)
    }

    /// Region framing the selected radius around `center`, capped to max span.
    static func region(
        center: CLLocationCoordinate2D,
        radiusMiles: Int
    ) -> MKCoordinateRegion {
        MKCoordinateRegion(center: center, span: span(forRadiusMiles: radiusMiles))
    }

    /// Meters for the on-map range ring at a given radius.
    static func radiusMeters(_ radiusMiles: Int) -> CLLocationDistance {
        Double(radiusMiles) * 1609.34
    }

    // MARK: Caption

    /// Honest precision caption for the currently-visible deals.
    /// - all exact → "Exact locations · N deals"
    /// - mixed     → "Exact + approximate · N deals"
    /// - all approx→ "Approximate areas · N deals"
    /// Returns nil when there are no visible deals.
    static func caption(for visible: [Deal]) -> String? {
        let n = visible.count
        guard n > 0 else { return nil }
        let unit = n == 1 ? "deal" : "deals"
        let approx = visible.filter { $0.isApproximateLocation }.count
        if approx == 0 { return "Exact locations · \(n) \(unit)" }
        if approx == n { return "Approximate areas · \(n) \(unit)" }
        return "Exact + approximate · \(n) \(unit)"
    }

    // MARK: Pins

    /// SF Symbol for a pin, category-aware (campus deals win over raw category).
    static func pinSymbol(for deal: Deal) -> String {
        if deal.campusSlug != nil { return "graduationcap.fill" }
        switch deal.category {
        case .food: return "fork.knife"
        case .groceries: return "cart.fill"
        case .entertainment: return "ticket.fill"
        case .home, .automotive, .beauty: return "building.2.fill"
        default: return "tag.fill"
        }
    }
}
