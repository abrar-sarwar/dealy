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

    // MARK: In-app route

    /// "{N} min · {D} mi" summary for an in-app directions route (ETA + distance).
    static func routeSummary(distanceMeters: Double, etaSeconds: Double) -> String {
        let miles = distanceMeters / 1609.34
        let mins = max(1, Int((etaSeconds / 60).rounded()))
        let dist = miles < 0.1 ? "<0.1 mi" : String(format: "%.1f mi", miles)
        return "\(mins) min · \(dist)"
    }

    // MARK: Spotlight camera

    /// Camera frame for the spotlight: ~2× the bubble diameter (4× radius across), so
    /// the circle sits centered with dimmed area visible around it. Capped so it never
    /// opens absurdly wide.
    static func spotlightRegion(center: CLLocationCoordinate2D, radiusMiles: Int) -> MKCoordinateRegion {
        let acrossMiles = min(Double(radiusMiles) * 4.0, 44.0)
        let delta = acrossMiles / 69.0
        return MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: delta, longitudeDelta: delta)
        )
    }

    /// Hard ceiling on the camera span's diagonal (≈ degrees of latitude). 12 miles
    /// ≈ 0.174° — this guarantees the map never opens at full-metro scale even when
    /// the selected radius is wide or a stray outlier is present.
    static let maxSpanDegrees: Double = 12.0 / 69.0

    // MARK: Dealy zone (bounded camera)

    /// Half-width of the Dealy service zone box (miles). The full box spans ~2× this
    /// (~24mi) so the user can frame the whole metro but never pan out to the state.
    static let zoneHalfMiles: Double = 12.0

    /// Maximum camera distance (meters) — caps zoom-out so the metro can't shrink to
    /// a state/country view. ≈ 60km.
    static let zoneMaxDistanceMeters: CLLocationDistance = 60_000

    /// The Dealy service-zone region: a ~24mi box centered on `center`. Used both as
    /// the camera-bounds box and as the cap for the fit-to-deals default frame.
    static func zoneRegion(center: CLLocationCoordinate2D) -> MKCoordinateRegion {
        let latMeters = zoneHalfMiles * 2 * 1609.34
        return MKCoordinateRegion(center: center,
                                  latitudinalMeters: latMeters,
                                  longitudinalMeters: latMeters)
    }

    /// Degrees-of-latitude span of the zone box (its hard outer cap).
    static var zoneSpanDegrees: Double { (zoneHalfMiles * 2) / 69.0 }

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

    /// Place markers within `radiusMiles` of `center` (great-circle distance from the
    /// marker's real coordinate). Keeps the place pins tracking the radius slider so
    /// the map doesn't clutter beyond the spotlight bubble.
    static func markersWithin(
        _ markers: [PlaceMarker],
        center: CLLocationCoordinate2D,
        radiusMiles: Int
    ) -> [PlaceMarker] {
        let origin = CLLocation(latitude: center.latitude, longitude: center.longitude)
        let limitMeters = radiusMeters(radiusMiles)
        return markers.filter { marker in
            let point = CLLocation(latitude: marker.latitude, longitude: marker.longitude)
            return origin.distance(from: point) <= limitMeters
        }
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

    // MARK: Radius slider

    /// Hard slider bounds (miles). The slider is continuous between these and snaps
    /// to integer miles. 15 ≈ the loaded local feed's outer edge.
    static let minRadiusMiles: Int = 1
    static let maxRadiusMiles: Int = 15

    /// Clamp + snap an arbitrary slider value to a whole mile in [min, max].
    static func snapRadius(_ raw: Double) -> Int {
        Int(min(max(raw.rounded(), Double(minRadiusMiles)), Double(maxRadiusMiles)))
    }

    /// Live "Within N mi · M deals" label for the slider, given the deals already
    /// scoped by the sheet filters (category/toggles) — radius applied here.
    static func radiusLabel(radiusMiles: Int, filtered: [Deal]) -> String {
        let count = within(filtered, radiusMiles: radiusMiles).count
        let unit = count == 1 ? "deal" : "deals"
        return "Within \(radiusMiles) mi · \(count) \(unit)"
    }

    /// Empty-state predicate: true when the radius + sheet filters yield zero deals
    /// even though the area has mappable inventory. Drives the "widen the slider /
    /// change Filters" message (vs. the genuinely-no-inventory case where
    /// `totalMappable` is empty).
    static func isRadiusEmpty(shown: [Deal], totalMappable: [Deal]) -> Bool {
        shown.isEmpty && !totalMappable.isEmpty
    }

    /// Default camera frame: fit ALL provided `deals` (with a little margin),
    /// centered on `center`, but never larger than the zone box and never smaller
    /// than a comfortable minimum. This is the "show everything in the area" frame
    /// — NOT a small default radius.
    ///
    /// Empty input → the full zone box (so the user still sees the whole zone).
    static func zoneFitRegion(
        center: CLLocationCoordinate2D,
        deals: [Deal]
    ) -> MKCoordinateRegion {
        let zoneSpan = zoneSpanDegrees
        let coords = deals.compactMap { deal -> CLLocationCoordinate2D? in
            DealGeo.coordinate(for: deal, around: center)
        }
        guard !coords.isEmpty else {
            return MKCoordinateRegion(
                center: center,
                span: MKCoordinateSpan(latitudeDelta: zoneSpan, longitudeDelta: zoneSpan)
            )
        }
        // Max distance from center to any deal, in degrees, on each axis.
        let lonScale = max(cos(center.latitude * .pi / 180), 0.01)
        var maxLat = 0.0
        var maxLon = 0.0
        for c in coords {
            maxLat = max(maxLat, abs(c.latitude - center.latitude))
            maxLon = max(maxLon, abs(c.longitude - center.longitude) * lonScale)
        }
        let minSpan = 0.02          // ~1.4mi floor so a single near deal isn't absurdly tight
        let margin = 1.4            // breathing room around the farthest pin
        // Use the larger axis so a roughly-square frame contains every deal.
        let needed = max(maxLat, maxLon / lonScale) * 2 * margin
        let lat = min(max(needed, minSpan), zoneSpan)
        let lon = min(max(needed, minSpan), zoneSpan)
        return MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: lat, longitudeDelta: lon)
        )
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

    // MARK: Count label

    /// The deal-count overlay text, reflecting the active filter against the full
    /// mappable area.
    /// - primary: "N deals in this area" (N = currently shown count)
    /// - breakdown: "X food · Y grocery · Z campus" (omits zero buckets; nil if none)
    /// - hint: "Showing X of Y — tap Filters to widen." — present ONLY when the
    ///   active filter/radius is hiding deals (shown < total mappable). nil otherwise.
    struct CountLabel: Equatable {
        let primary: String
        let breakdown: String?
        let hint: String?
    }

    static func countLabel(shown: [Deal], totalMappable: [Deal]) -> CountLabel {
        let n = shown.count
        let unit = n == 1 ? "deal" : "deals"
        let primary = "\(n) \(unit) in this area"

        let food = shown.filter { $0.category == .food }.count
        let grocery = shown.filter { $0.category == .groceries }.count
        let campus = shown.filter { $0.campusSlug != nil }.count
        var parts: [String] = []
        if food > 0 { parts.append("\(food) food") }
        if grocery > 0 { parts.append("\(grocery) grocery") }
        if campus > 0 { parts.append("\(campus) campus") }
        let breakdown = parts.isEmpty ? nil : parts.joined(separator: " · ")

        let total = totalMappable.count
        let hint = n < total
            ? "Showing \(n) of \(total) — tap Filters to widen."
            : nil

        return CountLabel(primary: primary, breakdown: breakdown, hint: hint)
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
