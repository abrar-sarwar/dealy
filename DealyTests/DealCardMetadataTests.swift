import XCTest
import CoreLocation
@testable import Dealy

final class DealCardMetadataTests: XCTestCase {
    private let reference = Date(timeIntervalSince1970: 1_750_000_000)

    func testLocalDealShowsDistanceCategoryAndExpiry() {
        // Exact location with distance → precise distance
        let deal = makeDeal(isOnline: false, distance: 1.4, locationPrecision: "exact")

        XCTAssertEqual(
            DealCardMetadata.items(for: deal, reference: reference),
            ["1.4 mi", "Food", "2d left"]
        )
    }

    func testOnlineDealUsesOnlineInsteadOfDistance() {
        let deal = makeDeal(isOnline: true, distance: 0, locationPrecision: "exact")

        XCTAssertEqual(
            DealCardMetadata.items(for: deal, reference: reference),
            ["Online", "Food", "2d left"]
        )
    }

    func testApproximateDealWithLocationTagShowsAreaLabel() {
        let deal = makeDeal(isOnline: false, distance: 0.4,
                            locationPrecision: "approximate",
                            locationTags: ["midtown"])
        XCTAssertEqual(DealCardMetadata.items(for: deal, reference: reference)[0], "~ Midtown")
    }

    func testApproximateDealWithNoTagsShowsNearby() {
        let deal = makeDeal(isOnline: false, distance: 0.4,
                            locationPrecision: "approximate",
                            locationTags: [])
        XCTAssertEqual(DealCardMetadata.items(for: deal, reference: reference)[0], "~ nearby")
    }

    // MARK: - Format.locationLabel

    func testLocationLabelApproximateWithTag() {
        let deal = makeDeal(isOnline: false, distance: 0.4,
                            locationPrecision: "approximate",
                            locationTags: ["midtown"])
        XCTAssertEqual(Format.locationLabel(for: deal), "~ Midtown")
    }

    func testLocationLabelApproximateNoTags() {
        let deal = makeDeal(isOnline: false, distance: 0.4,
                            locationPrecision: "approximate",
                            locationTags: [])
        XCTAssertEqual(Format.locationLabel(for: deal), "~ nearby")
    }

    func testLocationLabelExactPreciseDistance() {
        let deal = makeDeal(isOnline: false, distance: 0.4, locationPrecision: "exact")
        XCTAssertEqual(Format.locationLabel(for: deal), "0.4 mi")
    }

    func testLocationLabelOnline() {
        let deal = makeDeal(isOnline: true, distance: 0, locationPrecision: "exact")
        XCTAssertEqual(Format.locationLabel(for: deal), "Online")
    }

    // MARK: - DealGeo

    func testDealGeoReturnsExactCoordinatesWhenPresent() {
        let lat = 33.7531
        let lon = -84.3857
        var deal = makeDeal(isOnline: false, distance: 0.4, locationPrecision: "exact")
        // Rebuild with explicit coords
        deal = Deal(
            id: "geo-test",
            title: "T",
            merchant: "M",
            category: .food,
            currentPrice: 1,
            originalPrice: 2,
            distanceMiles: 0.4,
            expirationDate: reference.addingTimeInterval(3600),
            dealScore: 80,
            isOnline: false,
            shortDescription: "",
            detailedDescription: "",
            terms: "",
            locationTags: [],
            couponCode: nil,
            destinationURL: nil,
            latitude: lat,
            longitude: lon,
            visualSeed: 42
        )
        let center = CLLocationCoordinate2D(latitude: 33.75, longitude: -84.39)
        let coord = DealGeo.coordinate(for: deal, around: center)
        XCTAssertEqual(coord.latitude, lat, accuracy: 0.000001)
        XCTAssertEqual(coord.longitude, lon, accuracy: 0.000001)
    }

    // MARK: - Helpers

    private func makeDeal(isOnline: Bool,
                           distance: Double,
                           locationPrecision: String = "approximate",
                           locationTags: [String] = []) -> Deal {
        var deal = Deal(
            id: "test",
            title: "Test Deal",
            merchant: "Test Merchant",
            category: .food,
            currentPrice: 10,
            originalPrice: 20,
            distanceMiles: distance,
            expirationDate: reference.addingTimeInterval(60 * 60 * 48),
            dealScore: 80,
            isOnline: isOnline,
            shortDescription: "",
            detailedDescription: "",
            terms: "",
            locationTags: locationTags,
            couponCode: nil,
            destinationURL: nil,
            latitude: nil,
            longitude: nil,
            visualSeed: 1
        )
        deal.locationPrecision = locationPrecision
        return deal
    }
}
