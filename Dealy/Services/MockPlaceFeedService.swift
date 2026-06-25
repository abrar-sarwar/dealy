import Foundation

/// In-memory mock for the enriched-place feed. Deterministic; used for previews,
/// the offline/mock app build, and tests. Coordinates are anchored near GSU so
/// directions launch sensibly in previews.
final class MockPlaceFeedService: PlaceFeedServicing {
    var simulateFailureOnce: Bool
    var simulateMarkerFailureOnce: Bool

    init(simulateFailureOnce: Bool = false, simulateMarkerFailureOnce: Bool = false) {
        self.simulateFailureOnce = simulateFailureOnce
        self.simulateMarkerFailureOnce = simulateMarkerFailureOnce
    }

    func fetchPlaceSections(latitude: Double, longitude: Double) async throws -> [PlaceFeedSection] {
        if simulateFailureOnce {
            simulateFailureOnce = false
            throw DealServiceError.unavailable
        }
        return Self.sample
    }

    func fetchPlaceMarkers(latitude: Double, longitude: Double) async throws -> [PlaceMarker] {
        if simulateMarkerFailureOnce {
            simulateMarkerFailureOnce = false
            throw DealServiceError.unavailable
        }
        return Self.sampleMarkers
    }

    /// Deterministic map markers anchored near GSU, covering several marker kinds
    /// and a mix of present/absent photos, so previews + the offline build render
    /// place pins + the preview card without a backend.
    static let sampleMarkers: [PlaceMarker] = [
        PlaceMarker(id: "m1", name: "Baraka Shawarma", category: .food,
                    latitude: 33.7563, longitude: -84.3909, priceBucket: "$", rating: 4.6,
                    whyRecommended: "High ratings and low prices for a filling meal.",
                    primaryPhotoUrl: nil, imageStatus: "none", kind: .food),
        PlaceMarker(id: "m2", name: "Con Leche Coffee", category: .food,
                    latitude: 33.754, longitude: -84.388, priceBucket: "$", rating: 4.8,
                    whyRecommended: "Quality coffee at accessible prices.",
                    primaryPhotoUrl: nil, imageStatus: "none", kind: .cafe),
        PlaceMarker(id: "m3", name: "Blossom Tree", category: .food,
                    latitude: 33.755, longitude: -84.39, priceBucket: "$$", rating: 4.7,
                    whyRecommended: "A local favorite that flies under the radar.",
                    primaryPhotoUrl: nil, imageStatus: "none", kind: .hiddenGem),
        PlaceMarker(id: "m4", name: "The Food Shoppe", category: .food,
                    latitude: 33.752, longitude: -84.385, priceBucket: "$", rating: 4.5,
                    whyRecommended: "Affordable comfort food students love.",
                    primaryPhotoUrl: nil, imageStatus: "none", kind: .student),
    ]

    static let sample: [PlaceFeedSection] = [
        PlaceFeedSection(
            key: "cheap_eats",
            title: "Best cheap eats near gsu",
            places: [
                Place(id: "p1", name: "Baraka Shawarma", category: .food, priceBucket: "$",
                      rating: 4.6, whyRecommended: "High ratings and low prices for a filling meal.",
                      bestFor: "budget-friendly dinner", address: "68 Walton St NW, Atlanta",
                      latitude: 33.7563, longitude: -84.3909, vibeTags: ["casual", "fast-casual"],
                      studentValueScore: 0.95, confidenceLabel: "high"),
                Place(id: "p2", name: "Con Leche Coffee", category: .food, priceBucket: "$",
                      rating: 4.8, whyRecommended: "Quality coffee at accessible prices.",
                      bestFor: "study fuel", address: "Atlanta, GA",
                      latitude: 33.754, longitude: -84.388, vibeTags: ["cozy"],
                      studentValueScore: 0.9, confidenceLabel: "high"),
            ]
        ),
        PlaceFeedSection(
            key: "hidden_gem",
            title: "Hidden gems near gsu",
            places: [
                Place(id: "p3", name: "Blossom Tree", category: .food, priceBucket: "$$",
                      rating: 4.7, whyRecommended: "A local favorite that flies under the radar.",
                      bestFor: "a quiet meal", address: "Atlanta, GA",
                      latitude: 33.755, longitude: -84.39, vibeTags: ["hidden", "local"],
                      studentValueScore: 0.7, confidenceLabel: "medium"),
            ]
        ),
        PlaceFeedSection(
            key: "student_friendly",
            title: "Student-friendly spots",
            places: [
                Place(id: "p4", name: "The Food Shoppe", category: .food, priceBucket: "$",
                      rating: 4.5, whyRecommended: "Affordable comfort food students love.",
                      bestFor: "between classes", address: "Atlanta, GA",
                      latitude: 33.752, longitude: -84.385, vibeTags: ["affordable"],
                      studentValueScore: 0.85, confidenceLabel: "high"),
            ]
        ),
    ]
}
