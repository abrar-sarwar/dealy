import XCTest
import CoreLocation
@testable import Dealy

/// Verifies the `/v1/feeds/places/map` JSON contract decodes into `PlaceMarker`,
/// the `markerKind` → SF Symbol/tint mapping (incl. unknown → default), the photo
/// resolution helper (real URL vs. artwork fallback), the within-radius marker
/// filter, and that `AppState.loadPlaceMarkers` populates on success / empties on
/// failure.
final class PlaceMarkerTests: XCTestCase {

    /// Mirrors the real backend map-feed response (a JSON array of markers), with a
    /// photo-bearing marker and a photo-less one.
    private let sampleJSON = """
    [
      {
        "id": "7e9acbf4-73a3-418d-b10a-d194f0031a7d",
        "name": "Gus's World Famous Fried Chicken",
        "categorySlug": "food",
        "latitude": 33.7599974,
        "longitude": -84.3862075,
        "priceBucket": "$",
        "rating": 4.2,
        "whyRecommended": "Famous for authentic fried chicken at an accessible price.",
        "budgetTip": "Get the 2-piece dark with a side to keep it under $12.",
        "primaryPhotoUrl": "https://lh3.googleusercontent.com/places/abc123",
        "imageStatus": "ready",
        "markerKind": "food"
      },
      {
        "id": "66b32b9e-69ec-4ead-b80c-d9ae838f6305",
        "name": "Market Cafe",
        "categorySlug": "food",
        "latitude": 33.7611022,
        "longitude": -84.389234,
        "priceBucket": null,
        "rating": 4.2,
        "whyRecommended": "Under-the-radar spot with a good rating.",
        "primaryPhotoUrl": null,
        "imageStatus": "none",
        "markerKind": "hidden_gem"
      }
    ]
    """.data(using: .utf8)!

    // MARK: Decode

    func testDecodesMarkersAndMapsToDomain() throws {
        let markers = try APIClient.jsonDecoder.decode([PlaceMarkerDTO].self, from: sampleJSON)
            .map { $0.toMarker() }

        XCTAssertEqual(markers.count, 2)
        let gus = markers[0]
        XCTAssertEqual(gus.id, "7e9acbf4-73a3-418d-b10a-d194f0031a7d")
        XCTAssertEqual(gus.name, "Gus's World Famous Fried Chicken")
        XCTAssertEqual(gus.category, .food)
        XCTAssertEqual(gus.latitude, 33.7599974, accuracy: 0.0001)
        XCTAssertEqual(gus.longitude, -84.3862075, accuracy: 0.0001)
        XCTAssertEqual(gus.priceBucket, "$")
        XCTAssertEqual(gus.rating, 4.2)
        XCTAssertEqual(gus.primaryPhotoUrl, "https://lh3.googleusercontent.com/places/abc123")
        XCTAssertEqual(gus.imageStatus, "ready")
        XCTAssertEqual(gus.kind, .food)
        XCTAssertEqual(gus.budgetTip, "Get the 2-piece dark with a side to keep it under $12.")

        let market = markers[1]
        XCTAssertNil(market.priceBucket)
        XCTAssertNil(market.primaryPhotoUrl)
        XCTAssertNil(market.budgetTip) // absent in JSON → nil
        XCTAssertEqual(market.kind, .hiddenGem)
    }

    func testUnknownCategorySlugFallsBackToFood() throws {
        let json = """
        [{"id":"1","name":"X","categorySlug":"nightclub","latitude":1,"longitude":2,
          "markerKind":"food"}]
        """.data(using: .utf8)!
        let marker = try APIClient.jsonDecoder.decode([PlaceMarkerDTO].self, from: json)[0].toMarker()
        XCTAssertEqual(marker.category, .food)
    }

    // MARK: markerKind mapping

    func testKnownMarkerKindsMapToSymbols() {
        XCTAssertEqual(PlaceMarkerKind.from("food").symbol, "fork.knife")
        XCTAssertEqual(PlaceMarkerKind.from("cafe").symbol, "cup.and.saucer.fill")
        XCTAssertEqual(PlaceMarkerKind.from("hidden_gem").symbol, "sparkles")
        XCTAssertEqual(PlaceMarkerKind.from("student").symbol, "graduationcap.fill")
        XCTAssertEqual(PlaceMarkerKind.from("deal").symbol, "tag.fill")
        XCTAssertEqual(PlaceMarkerKind.from("service").symbol, "wrench.and.screwdriver.fill")
    }

    func testKnownMarkerKindsParse() {
        XCTAssertEqual(PlaceMarkerKind.from("hidden_gem"), .hiddenGem)
        XCTAssertEqual(PlaceMarkerKind.from("service"), .service)
    }

    func testUnknownMarkerKindFallsBackToDeal() {
        XCTAssertEqual(PlaceMarkerKind.from("nightclub"), .deal)
        XCTAssertEqual(PlaceMarkerKind.from(nil), .deal)
        XCTAssertEqual(PlaceMarkerKind.from(""), .deal)
        // A sensible, renderable default symbol.
        XCTAssertEqual(PlaceMarkerKind.from("???").symbol, "tag.fill")
    }

    // MARK: Photo resolution (mirrors DealImage.resolvedSource)

    func testRemotePhotoResolves() {
        let src = PlaceImage.resolvedSource(photoURL: "https://lh3.googleusercontent.com/places/x")
        guard case .remote(let url) = src else { return XCTFail("expected remote") }
        XCTAssertEqual(url.absoluteString, "https://lh3.googleusercontent.com/places/x")
    }

    func testNilOrEmptyPhotoFallsBackToArtwork() {
        XCTAssertEqual(PlaceImage.resolvedSource(photoURL: nil), .fallback)
        XCTAssertEqual(PlaceImage.resolvedSource(photoURL: ""), .fallback)
    }

    func testNonHTTPSPhotoFallsBackToArtwork() {
        XCTAssertEqual(PlaceImage.resolvedSource(photoURL: "http://example.com/a.jpg"), .fallback)
        XCTAssertEqual(PlaceImage.resolvedSource(photoURL: "not a url"), .fallback)
    }

    // MARK: Within-radius filter

    func testMarkersWithinRadiusReturnsOnlyNearbyOnes() {
        let center = CLLocationCoordinate2D(latitude: 33.7563, longitude: -84.3909)
        let near = makeMarker(id: "near", lat: 33.7570, lng: -84.3915)  // ~0.06 mi
        // ~3.5 mi north — outside a 1mi but inside a 5mi radius.
        let far = makeMarker(id: "far", lat: 33.8070, lng: -84.3909)

        let within1 = MapCameraModel.markersWithin([near, far], center: center, radiusMiles: 1)
        XCTAssertEqual(within1.map(\.id), ["near"])

        let within5 = MapCameraModel.markersWithin([near, far], center: center, radiusMiles: 5)
        XCTAssertEqual(Set(within5.map(\.id)), ["near", "far"])
    }

    // MARK: AppState

    func testAppStateLoadsPlaceMarkersFromService() async {
        let app = await AppState(store: InMemoryPreferencesStore(),
                                 dealService: MockDealService(artificialDelay: .zero),
                                 placeFeedService: MockPlaceFeedService())
        await app.loadPlaceMarkers()
        let markers = await app.placeMarkers
        XCTAssertFalse(markers.isEmpty)
        XCTAssertEqual(markers.first?.id, "m1")
    }

    func testAppStateLeavesPlaceMarkersEmptyOnFailure() async {
        let app = await AppState(store: InMemoryPreferencesStore(),
                                 dealService: MockDealService(artificialDelay: .zero),
                                 placeFeedService: MockPlaceFeedService(simulateMarkerFailureOnce: true))
        await app.loadPlaceMarkers()
        let markers = await app.placeMarkers
        XCTAssertTrue(markers.isEmpty)
    }

    // MARK: Place card photo fallback (the Explore "no logo-only" rule)

    func testPlaceCardWithPhotoUsesRemotePath() {
        XCTAssertNotEqual(PlaceImage.resolvedSource(photoURL: "https://lh3.googleusercontent.com/p/x"),
                          .fallback)
    }

    func testPlaceCardDTODecodesPhotoFields() throws {
        let json = """
        [{"key":"k","title":"t","places":[
          {"id":"1","name":"X","categorySlug":"food",
           "primaryPhotoUrl":"https://lh3.googleusercontent.com/p/abc","imageStatus":"ready"}
        ]}]
        """.data(using: .utf8)!
        let place = try APIClient.jsonDecoder.decode([PlaceFeedSectionDTO].self, from: json)
            .map { $0.toSection() }[0].places[0]
        XCTAssertEqual(place.primaryPhotoUrl, "https://lh3.googleusercontent.com/p/abc")
        XCTAssertEqual(place.imageStatus, "ready")
    }

    // MARK: budgetTipDisplay (drives the preview card tip line show/hide)

    func testMarkerBudgetTipDisplayShowsWhenPresent() {
        let m = PlaceMarker(id: "1", name: "X", category: .food, latitude: 0, longitude: 0,
                            priceBucket: nil, rating: nil, whyRecommended: nil,
                            budgetTip: "Split the platter to save.",
                            primaryPhotoUrl: nil, imageStatus: nil, kind: .food)
        XCTAssertEqual(m.budgetTipDisplay, "Split the platter to save.")
    }

    func testMarkerBudgetTipDisplayHiddenWhenNilOrBlank() {
        let none = makeMarker(id: "n", lat: 0, lng: 0) // budgetTip defaults to nil
        XCTAssertNil(none.budgetTipDisplay)
        let blank = PlaceMarker(id: "1", name: "X", category: .food, latitude: 0, longitude: 0,
                                priceBucket: nil, rating: nil, whyRecommended: nil,
                                budgetTip: "  ", primaryPhotoUrl: nil, imageStatus: nil, kind: .food)
        XCTAssertNil(blank.budgetTipDisplay)
    }

    // MARK: Helpers

    private func makeMarker(id: String, lat: Double, lng: Double) -> PlaceMarker {
        PlaceMarker(id: id, name: id, category: .food, latitude: lat, longitude: lng,
                    priceBucket: nil, rating: nil, whyRecommended: nil,
                    primaryPhotoUrl: nil, imageStatus: nil, kind: .food)
    }
}
