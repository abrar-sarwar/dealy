import XCTest
import CoreLocation
@testable import Dealy

/// Verifies the `/v1/feeds/places` JSON contract decodes into the domain
/// `PlaceFeedSection`/`Place`, category mapping, the "near <region>" → "near you"
/// title transform, and that a place with coordinates yields a directions URL.
final class PlaceFeedTests: XCTestCase {

    /// Mirrors the real backend response shape (a JSON array of sections).
    private let sampleJSON = """
    [
      {
        "key": "cheap_eats",
        "title": "Best cheap eats near gsu",
        "places": [
          {
            "id": "8a2bef7c-a65e-4fef-b64f-92e6da0feeb8",
            "name": "Baraka Shawarma Atlanta",
            "priceBucket": "$",
            "rating": 4.6,
            "score": 0.9435,
            "whyRecommended": "High ratings and low prices.",
            "categorySlug": "food",
            "address": "68 Walton St NW, Atlanta, GA 30303, USA",
            "latitude": 33.7563409,
            "longitude": -84.3908906,
            "bestFor": "budget-friendly flavorful dinner",
            "vibeTags": ["casual", "fast-casual"],
            "studentValueScore": 0.95,
            "confidenceLabel": "high"
          }
        ]
      },
      {
        "key": "hidden_gem",
        "title": "Hidden gems near gsu",
        "places": []
      }
    ]
    """.data(using: .utf8)!

    func testDecodesSectionsAndMapsToDomain() throws {
        let dtos = try APIClient.jsonDecoder.decode([PlaceFeedSectionDTO].self, from: sampleJSON)
        let sections = dtos.map { $0.toSection() }

        XCTAssertEqual(sections.count, 2)
        let cheap = sections[0]
        XCTAssertEqual(cheap.key, "cheap_eats")
        XCTAssertEqual(cheap.places.count, 1)

        let place = cheap.places[0]
        XCTAssertEqual(place.id, "8a2bef7c-a65e-4fef-b64f-92e6da0feeb8")
        XCTAssertEqual(place.name, "Baraka Shawarma Atlanta")
        XCTAssertEqual(place.category, .food)
        XCTAssertEqual(place.priceBucket, "$")
        XCTAssertEqual(place.rating, 4.6)
        XCTAssertEqual(place.whyRecommended, "High ratings and low prices.")
        XCTAssertEqual(place.bestFor, "budget-friendly flavorful dinner")
        XCTAssertEqual(place.address, "68 Walton St NW, Atlanta, GA 30303, USA")
        XCTAssertEqual(place.latitude!, 33.7563409, accuracy: 0.0001)
        XCTAssertEqual(place.longitude!, -84.3908906, accuracy: 0.0001)
        XCTAssertEqual(place.vibeTags, ["casual", "fast-casual"])
        XCTAssertEqual(place.studentValueScore, 0.95)
        XCTAssertEqual(place.confidenceLabel, "high")
        XCTAssertTrue(place.hasCoordinates)
    }

    func testUnknownCategorySlugFallsBackToFood() throws {
        let json = """
        [{"key":"k","title":"t","places":[
          {"id":"1","name":"X","categorySlug":"nightclub"}
        ]}]
        """.data(using: .utf8)!
        let sections = try APIClient.jsonDecoder.decode([PlaceFeedSectionDTO].self, from: json)
            .map { $0.toSection() }
        XCTAssertEqual(sections[0].places[0].category, .food)
    }

    func testKnownCategorySlugMaps() throws {
        let json = """
        [{"key":"k","title":"t","places":[
          {"id":"1","name":"X","categorySlug":"groceries"}
        ]}]
        """.data(using: .utf8)!
        let sections = try APIClient.jsonDecoder.decode([PlaceFeedSectionDTO].self, from: json)
            .map { $0.toSection() }
        XCTAssertEqual(sections[0].places[0].category, .groceries)
    }

    func testNearRegionTitleBecomesNearYou() {
        XCTAssertEqual(PlaceFeedSection.localizedNearYou("Best cheap eats near gsu"),
                       "Best cheap eats near you")
        XCTAssertEqual(PlaceFeedSection.localizedNearYou("Hidden gems near gsu"),
                       "Hidden gems near you")
    }

    func testNonRegionTitlesAreLeftIntact() {
        // No trailing "near <token>" → unchanged.
        XCTAssertEqual(PlaceFeedSection.localizedNearYou("Highly rated nearby"),
                       "Highly rated nearby")
        XCTAssertEqual(PlaceFeedSection.localizedNearYou("Student-friendly spots"),
                       "Student-friendly spots")
        // "near" followed by multiple words is not a region slug → unchanged.
        XCTAssertEqual(PlaceFeedSection.localizedNearYou("Spots near the campus center"),
                       "Spots near the campus center")
    }

    func testPlaceWithCoordsYieldsDirectionsURL() throws {
        let place = Place(id: "1", name: "Baraka Shawarma", category: .food, priceBucket: "$",
                          rating: 4.6, whyRecommended: nil, bestFor: nil, address: nil,
                          latitude: 33.7563, longitude: -84.3909, vibeTags: [],
                          studentValueScore: nil, confidenceLabel: nil)
        let coord = try XCTUnwrap(
            place.latitude.flatMap { lat in place.longitude.map { CLLocationCoordinate2D(latitude: lat, longitude: $0) } })
        let url = DirectionsLauncher.url(to: coord, name: place.name)
        let items = Dictionary(uniqueKeysWithValues:
            (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(items["daddr"], "33.7563,-84.3909")
        XCTAssertEqual(items["q"], "Baraka Shawarma")
        XCTAssertEqual(items["dirflg"], "d")
    }

    func testPlaceWithoutCoordsHasNoCoordinates() {
        let place = Place(id: "1", name: "X", category: .food, priceBucket: nil, rating: nil,
                          whyRecommended: nil, bestFor: nil, address: nil, latitude: nil,
                          longitude: nil, vibeTags: [], studentValueScore: nil, confidenceLabel: nil)
        XCTAssertFalse(place.hasCoordinates)
    }

    func testAppStateLoadsPlaceSectionsFromService() async {
        let app = await AppState(store: InMemoryPreferencesStore(),
                                 dealService: MockDealService(artificialDelay: .zero),
                                 placeFeedService: MockPlaceFeedService())
        await app.loadPlaceSections()
        let sections = await app.placeSections
        XCTAssertFalse(sections.isEmpty)
        XCTAssertEqual(sections.first?.key, "cheap_eats")
    }

    func testAppStateLeavesPlaceSectionsEmptyOnFailure() async {
        let app = await AppState(store: InMemoryPreferencesStore(),
                                 dealService: MockDealService(artificialDelay: .zero),
                                 placeFeedService: MockPlaceFeedService(simulateFailureOnce: true))
        await app.loadPlaceSections()
        let sections = await app.placeSections
        XCTAssertTrue(sections.isEmpty)
    }
}
