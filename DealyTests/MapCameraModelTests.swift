import XCTest
import CoreLocation
@testable import Dealy

final class MapCameraModelTests: XCTestCase {

    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func deal(_ id: String,
                      category: DealCategory = .food,
                      distance: Double = 1,
                      precision: String = "exact",
                      online: Bool = false,
                      expiresInHours: Double = 48) -> Deal {
        var d = Deal(
            id: id, title: id, merchant: "M", category: category,
            currentPrice: 5, originalPrice: 10, distanceMiles: distance,
            expirationDate: ref.addingTimeInterval(expiresInHours * 3600),
            dealScore: 50, isOnline: online,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: ["Atlanta"], couponCode: nil, destinationURL: nil,
            latitude: 33.75, longitude: -84.39, visualSeed: 0, publishedAt: ref
        )
        d.locationPrecision = precision
        return d
    }

    // MARK: Mappable / filtering

    func testMappableExcludesOnlineAndExpired() {
        let deals = [
            deal("a", distance: 1),
            deal("b", online: true),
            deal("c", expiresInHours: -1)   // expired
        ]
        let m = MapCameraModel.mappable(deals, reference: ref)
        XCTAssertEqual(m.map(\.id), ["a"])
    }

    func testMappableSortedNearestFirst() {
        let deals = [deal("far", distance: 9), deal("near", distance: 1), deal("mid", distance: 4)]
        XCTAssertEqual(MapCameraModel.mappable(deals, reference: ref).map(\.id), ["near", "mid", "far"])
    }

    // MARK: Radius counts

    func testCountsPerRadius() {
        let deals = [
            deal("1", distance: 0.5),
            deal("2", distance: 2.5),
            deal("3", distance: 4.0),
            deal("4", distance: 8.0),
            deal("5", distance: 20.0)  // outside all options
        ]
        let m = MapCameraModel.mappable(deals, reference: ref)
        let counts = MapCameraModel.counts(for: m)
        XCTAssertEqual(counts.map(\.radius), [1, 3, 5, 10])
        XCTAssertEqual(counts.map(\.count), [1, 2, 3, 4])
    }

    func testCountForSingleRadius() {
        let deals = [deal("1", distance: 0.5), deal("2", distance: 4.0)]
        let m = MapCameraModel.mappable(deals, reference: ref)
        XCTAssertEqual(MapCameraModel.count(for: m, radiusMiles: 1), 1)
        XCTAssertEqual(MapCameraModel.count(for: m, radiusMiles: 5), 2)
    }

    func testCategoryAndRadiusCompose() {
        // food@3mi should be food deals within 3 miles only.
        let deals = [
            deal("food-near", category: .food, distance: 2),
            deal("food-far", category: .food, distance: 9),
            deal("groc-near", category: .groceries, distance: 1)
        ]
        let m = MapCameraModel.mappable(deals, reference: ref)
        let result = MapCameraModel.filtered(m, category: .food, radiusMiles: 3)
        XCTAssertEqual(result.map(\.id), ["food-near"])
    }

    func testDefaultRadiusPicksSmallestMeetingTarget() {
        // 1 within 1mi, 5 within 3mi → target 6 not met until... build it.
        var deals = [deal("a", distance: 0.5)]
        for i in 0..<6 { deals.append(deal("m\(i)", distance: 2.5)) } // 7 within 3mi
        let chosen = MapCameraModel.defaultRadius(for: deals, target: 6, reference: ref)
        XCTAssertEqual(chosen, 3)
    }

    func testDefaultRadiusFallsBackToWidestWhenSparse() {
        let deals = [deal("a", distance: 0.5)]   // only 1 deal anywhere
        XCTAssertEqual(MapCameraModel.defaultRadius(for: deals, target: 6, reference: ref), 10)
    }

    func testDefaultRadiusSkipsFoodlessTightRadiusWhenFoodExistsFarther() {
        // 6 grocery within 1mi (meets target) but the only food is 2.5mi out. The
        // default must open at 3mi so "Food" isn't 0 by default (GSU-shaped case).
        var deals: [Deal] = []
        for i in 0..<6 { deals.append(deal("g\(i)", category: .groceries, distance: 0.4)) }
        deals.append(deal("food", category: .food, distance: 2.5))
        XCTAssertEqual(MapCameraModel.defaultRadius(for: deals, target: 6, reference: ref), 3)
    }

    // MARK: Camera span cap

    func testSpanNeverExceedsMaxCap() {
        for r in [1, 3, 5, 10, 100] {
            let span = MapCameraModel.span(forRadiusMiles: r)
            XCTAssertLessThanOrEqual(span.latitudeDelta, MapCameraModel.maxSpanDegrees + 1e-9,
                                     "radius \(r) exceeded max span")
            XCTAssertLessThanOrEqual(span.longitudeDelta, MapCameraModel.maxSpanDegrees + 1e-9)
        }
    }

    func testSpanGrowsWithRadiusUntilCap() {
        let s1 = MapCameraModel.span(forRadiusMiles: 1).latitudeDelta
        let s3 = MapCameraModel.span(forRadiusMiles: 3).latitudeDelta
        XCTAssertGreaterThan(s3, s1)
    }

    func testRegionCentersOnGivenCoordinate() {
        let c = CLLocationCoordinate2D(latitude: 33.749, longitude: -84.388)
        let region = MapCameraModel.region(center: c, radiusMiles: 5)
        XCTAssertEqual(region.center.latitude, 33.749, accuracy: 1e-9)
        XCTAssertEqual(region.center.longitude, -84.388, accuracy: 1e-9)
        XCTAssertLessThanOrEqual(region.span.latitudeDelta, MapCameraModel.maxSpanDegrees + 1e-9)
    }

    // MARK: Caption

    func testCaptionAllExact() {
        let deals = [deal("a", precision: "exact"), deal("b", precision: "exact")]
        XCTAssertEqual(MapCameraModel.caption(for: deals), "Exact locations · 2 deals")
    }

    func testCaptionAllApproximate() {
        let deals = [deal("a", precision: "approximate")]
        XCTAssertEqual(MapCameraModel.caption(for: deals), "Approximate areas · 1 deal")
    }

    func testCaptionMixed() {
        let deals = [deal("a", precision: "exact"), deal("b", precision: "approximate")]
        XCTAssertEqual(MapCameraModel.caption(for: deals), "Exact + approximate · 2 deals")
    }

    func testCaptionNilWhenEmpty() {
        XCTAssertNil(MapCameraModel.caption(for: []))
    }

    // MARK: Pin symbol

    func testPinSymbolByCategory() {
        XCTAssertEqual(MapCameraModel.pinSymbol(for: deal("a", category: .food)), "fork.knife")
        XCTAssertEqual(MapCameraModel.pinSymbol(for: deal("b", category: .groceries)), "cart.fill")
        XCTAssertEqual(MapCameraModel.pinSymbol(for: deal("c", category: .entertainment)), "ticket.fill")
        XCTAssertEqual(MapCameraModel.pinSymbol(for: deal("d", category: .tech)), "tag.fill")
    }

    func testPinSymbolCampusWins() {
        var d = deal("e", category: .food)
        d.campusSlug = "gsu"
        XCTAssertEqual(MapCameraModel.pinSymbol(for: d), "graduationcap.fill")
    }
}
