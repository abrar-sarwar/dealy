import Foundation

/// Async boundary for sourcing the enriched-place feed sections (cheap eats,
/// hidden gems, …) anchored to a coordinate. The backend resolves the coordinate
/// to its nearest region; the client just sends `lat`/`lng`.
protocol PlaceFeedServicing: AnyObject, Sendable {
    func fetchPlaceSections(latitude: Double, longitude: Double) async throws -> [PlaceFeedSection]

    /// Async boundary for the bounded (≤40) map markers anchored to a coordinate,
    /// for the Map's place pins. The backend resolves the coordinate to its nearest
    /// region; the client just sends `lat`/`lng`.
    func fetchPlaceMarkers(latitude: Double, longitude: Double) async throws -> [PlaceMarker]
}
