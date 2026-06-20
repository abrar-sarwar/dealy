import CoreLocation

/// Maps a deal to a plausible map coordinate. Uses the deal's real coordinates
/// when present; otherwise scatters it deterministically around the campus using
/// its distance and a stable per-deal angle, so the map is stable across launches.
///
/// TODO: Replace synthetic scatter with real merchant coordinates from the backend.
enum DealGeo {
    static func coordinate(for deal: Deal, around campus: Campus) -> CLLocationCoordinate2D {
        coordinate(for: deal, around: CLLocationCoordinate2D(latitude: campus.latitude,
                                                             longitude: campus.longitude))
    }

    static func coordinate(for deal: Deal, around center: CLLocationCoordinate2D) -> CLLocationCoordinate2D {
        if let lat = deal.latitude, let lon = deal.longitude {
            return CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        // Golden-angle scatter keyed on visualSeed → even, deterministic spread.
        let angle = Double(deal.visualSeed) * 2.399963229728653
        let miles = max(deal.distanceMiles, 0.15)
        let latDelta = miles / 69.0
        let lonDelta = miles / (69.0 * max(cos(center.latitude * .pi / 180), 0.01))
        return CLLocationCoordinate2D(
            latitude: center.latitude + latDelta * sin(angle),
            longitude: center.longitude + lonDelta * cos(angle)
        )
    }
}
