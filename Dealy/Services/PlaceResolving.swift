import CoreLocation
import Foundation

// MARK: - Contract

/// A geocoded place the user can pick as a manual discovery center. Identity is
/// derived from coordinates + name so an ambiguous query yields distinct rows.
struct PlaceCandidate: Identifiable, Equatable, Sendable {
    var id: String { "\(latitude),\(longitude),\(displayName)" }
    let displayName: String
    let latitude: Double
    let longitude: Double

    var center: DiscoveryCenter {
        DiscoveryCenter(
            latitude: latitude,
            longitude: longitude,
            displayName: displayName,
            source: .manual
        )
    }
}

/// Typed failures for manual place resolution.
enum PlaceResolverError: Error, Equatable {
    case unavailable
}

/// Turns a free-text city/ZIP query into zero or more candidate places.
protocol PlaceResolving: Sendable {
    func resolve(_ query: String) async throws -> [PlaceCandidate]
}

// MARK: - Apple geocoder implementation

/// `CLGeocoder`-backed resolver. No paid location API. Empty/blank input returns
/// `[]` without a network call; geocoder failures map to `.unavailable`.
struct ApplePlaceResolver: PlaceResolving {
    func resolve(_ query: String) async throws -> [PlaceCandidate] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        let placemarks: [CLPlacemark]
        do {
            placemarks = try await CLGeocoder().geocodeAddressString(trimmed)
        } catch {
            throw PlaceResolverError.unavailable
        }

        var seen = Set<String>()
        var candidates: [PlaceCandidate] = []
        for placemark in placemarks {
            guard let coordinate = placemark.location?.coordinate else { continue }
            let candidate = PlaceCandidate(
                displayName: Self.displayName(for: placemark),
                latitude: coordinate.latitude,
                longitude: coordinate.longitude
            )
            if seen.insert(candidate.id).inserted {
                candidates.append(candidate)
            }
        }
        return candidates
    }

    /// Prefer "City, ST"; fall back to whatever components are present.
    private static func displayName(for placemark: CLPlacemark) -> String {
        let locality = placemark.locality ?? placemark.subAdministrativeArea ?? placemark.name
        let admin = placemark.administrativeArea
        switch (locality, admin) {
        case let (city?, state?): return "\(city), \(state)"
        case let (city?, nil): return city
        case let (nil, state?): return state
        default: return placemark.name ?? "Unknown location"
        }
    }
}

// MARK: - Deterministic mock

/// Test/preview double returning a fixed result.
struct MockPlaceResolver: PlaceResolving {
    private let result: Result<[PlaceCandidate], PlaceResolverError>

    init(result: Result<[PlaceCandidate], PlaceResolverError> = .success([])) {
        self.result = result
    }

    func resolve(_ query: String) async throws -> [PlaceCandidate] {
        try result.get()
    }
}
