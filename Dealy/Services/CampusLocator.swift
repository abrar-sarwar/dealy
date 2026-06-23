import CoreLocation
import Foundation

/// Result of matching a device coordinate to a supported campus. Advisory input
/// to ranking/personalization ONLY — never an access gate.
enum CampusAssignment: Equatable {
    /// Within `CampusLocator.campusMatchRadiusMiles` of a campus.
    case assigned(Campus, distanceMiles: Double)
    /// Beyond the threshold; nearest campus retained for honest messaging.
    case outOfRange(nearest: Campus, distanceMiles: Double)
    /// No coordinate (permission denied / no fix).
    case unavailable
}

/// Pure, dependency-free campus matcher. Turns a coordinate into a
/// `CampusAssignment` via great-circle distance to the four real campuses.
///
/// Dealy never asks the user which school they attend; this is how the active
/// campus is determined automatically. The result feeds ranking/personalization
/// and can never remove a deal from the feed.
enum CampusLocator {
    /// Campus-match threshold (miles). Distinct from any campus `defaultRadius`,
    /// which is a deal-search radius — a different concept.
    static let campusMatchRadiusMiles = 30.0

    /// The four real campuses. Excludes the `atl` meta-anchor by design.
    static let matchableCampuses: [Campus] = [
        .georgiaState, .georgiaTech, .kennesaw, .uga,
    ]

    static func locate(from coordinate: CLLocationCoordinate2D?) -> CampusAssignment {
        guard let coordinate else { return .unavailable }

        // Pair each campus with its distance, then pick the nearest.
        // Ties break deterministically by campus id.
        var nearest: Campus?
        var nearestMiles = Double.greatestFiniteMagnitude
        for campus in matchableCampuses {
            let miles = milesBetween(coordinate, campus)
            let isCloser = miles < nearestMiles
            let isTieBrokenByID = miles == nearestMiles && campus.id < (nearest?.id ?? "")
            if isCloser || isTieBrokenByID {
                nearest = campus
                nearestMiles = miles
            }
        }

        guard let best = nearest else { return .unavailable }
        return nearestMiles <= campusMatchRadiusMiles
            ? .assigned(best, distanceMiles: nearestMiles)
            : .outOfRange(nearest: best, distanceMiles: nearestMiles)
    }

    /// Great-circle distance in miles between a coordinate and a campus center.
    private static func milesBetween(_ coordinate: CLLocationCoordinate2D, _ campus: Campus) -> Double {
        let here = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let there = CLLocation(latitude: campus.latitude, longitude: campus.longitude)
        return here.distance(from: there) / 1609.344 // meters → miles
    }
}
