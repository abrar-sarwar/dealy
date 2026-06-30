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
                      expiresInHours: Double = 48,
                      latitude: Double? = 33.75,
                      longitude: Double? = -84.39,
                      campusSlug: String? = nil) -> Deal {
        var d = Deal(
            id: id, title: id, merchant: "M", category: category,
            currentPrice: 5, originalPrice: 10, distanceMiles: distance,
            expirationDate: ref.addingTimeInterval(expiresInHours * 3600),
            dealScore: 50, isOnline: online,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: ["Atlanta"], couponCode: nil, destinationURL: nil,
            latitude: latitude, longitude: longitude, visualSeed: 0, publishedAt: ref
        )
        d.locationPrecision = precision
        d.campusSlug = campusSlug
        return d
    }

    private let atlanta = CLLocationCoordinate2D(latitude: 33.7490, longitude: -84.3880)

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

    // MARK: Radius slider — drives the visible set + ring

    func testRadiusDrivesFilteredSet() {
        // The set of deals within radius N is exactly what the slider should show;
        // widening the radius can only add deals, never remove them.
        let deals = [
            deal("a", distance: 0.5),
            deal("b", distance: 2.5),
            deal("c", distance: 7.0),
            deal("d", distance: 12.0)
        ]
        let m = MapCameraModel.mappable(deals, reference: ref)
        XCTAssertEqual(MapCameraModel.within(m, radiusMiles: 1).map(\.id), ["a"])
        XCTAssertEqual(MapCameraModel.within(m, radiusMiles: 3).map(\.id), ["a", "b"])
        XCTAssertEqual(MapCameraModel.within(m, radiusMiles: 8).map(\.id), ["a", "b", "c"])
        XCTAssertEqual(MapCameraModel.within(m, radiusMiles: 15).map(\.id), ["a", "b", "c", "d"])
    }

    func testRadiusMetersTracksRadius() {
        // The MapCircle ring radius (meters) grows linearly with the slider value.
        XCTAssertEqual(MapCameraModel.radiusMeters(1), 1609.34, accuracy: 0.01)
        XCTAssertEqual(MapCameraModel.radiusMeters(5), 5 * 1609.34, accuracy: 0.01)
        XCTAssertGreaterThan(MapCameraModel.radiusMeters(10), MapCameraModel.radiusMeters(5))
    }

    func testSnapRadiusClampsAndRounds() {
        XCTAssertEqual(MapCameraModel.snapRadius(4.6), 5)
        XCTAssertEqual(MapCameraModel.snapRadius(4.2), 4)
        XCTAssertEqual(MapCameraModel.snapRadius(0.1), MapCameraModel.minRadiusMiles)  // clamp low
        XCTAssertEqual(MapCameraModel.snapRadius(99), MapCameraModel.maxRadiusMiles)   // clamp high
    }

    func testRadiusLabelIsLiveCountWithinRadius() {
        let m = MapCameraModel.mappable(
            [deal("a", distance: 0.5), deal("b", distance: 2.0), deal("c", distance: 9.0)],
            reference: ref)
        XCTAssertEqual(MapCameraModel.radiusLabel(radiusMiles: 3, filtered: m), "Within 3 mi · 2 deals")
        XCTAssertEqual(MapCameraModel.radiusLabel(radiusMiles: 1, filtered: m), "Within 1 mi · 1 deal")
        XCTAssertEqual(MapCameraModel.radiusLabel(radiusMiles: 15, filtered: m), "Within 15 mi · 3 deals")
    }

    // MARK: Empty-state predicate

    func testIsRadiusEmptyWhenFiltersYieldZeroButAreaHasDeals() {
        let total = [deal("a", distance: 9.0)]
        let shownAt1mi = MapCameraModel.within(total, radiusMiles: 1)  // empty
        XCTAssertTrue(MapCameraModel.isRadiusEmpty(shown: shownAt1mi, totalMappable: total))
    }

    func testIsRadiusEmptyFalseWhenSomethingShown() {
        let total = [deal("a", distance: 0.5)]
        XCTAssertFalse(MapCameraModel.isRadiusEmpty(shown: total, totalMappable: total))
    }

    func testIsRadiusEmptyFalseWhenNoInventoryAtAll() {
        // No mappable deals at all is a *different* (no-inventory) state, not the
        // "widen the slider" empty state.
        XCTAssertFalse(MapCameraModel.isRadiusEmpty(shown: [], totalMappable: []))
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

    // MARK: Zone-fit camera

    func testZoneFitNeverExceedsZoneBox() {
        // A deal far outside the zone must NOT widen the frame past the zone box.
        let near = deal("near", latitude: 33.75, longitude: -84.39)
        let wayOut = deal("out", latitude: 34.50, longitude: -85.20)  // ~60mi NW
        let region = MapCameraModel.zoneFitRegion(center: atlanta, deals: [near, wayOut])
        XCTAssertLessThanOrEqual(region.span.latitudeDelta, MapCameraModel.zoneSpanDegrees + 1e-9)
        XCTAssertLessThanOrEqual(region.span.longitudeDelta, MapCameraModel.zoneSpanDegrees + 1e-9)
    }

    func testZoneFitCoversAllProvidedDealsWithinZone() {
        // A spread of deals within the zone — the frame must contain each of them.
        let deals = [
            deal("a", latitude: 33.78, longitude: -84.41),
            deal("b", latitude: 33.72, longitude: -84.36),
            deal("c", latitude: 33.75, longitude: -84.39)
        ]
        let region = MapCameraModel.zoneFitRegion(center: atlanta, deals: deals)
        let halfLat = region.span.latitudeDelta / 2
        let halfLon = region.span.longitudeDelta / 2
        for d in deals {
            XCTAssertLessThanOrEqual(abs(d.latitude! - region.center.latitude), halfLat + 1e-6,
                                     "deal \(d.id) outside frame lat")
            XCTAssertLessThanOrEqual(abs(d.longitude! - region.center.longitude), halfLon + 1e-6,
                                     "deal \(d.id) outside frame lon")
        }
    }

    func testZoneFitEmptyFallsBackToZoneBox() {
        let region = MapCameraModel.zoneFitRegion(center: atlanta, deals: [])
        XCTAssertEqual(region.span.latitudeDelta, MapCameraModel.zoneSpanDegrees, accuracy: 1e-6)
        XCTAssertEqual(region.center.latitude, atlanta.latitude, accuracy: 1e-9)
    }

    func testZoneRegionCenteredAndSizedToBox() {
        let region = MapCameraModel.zoneRegion(center: atlanta)
        XCTAssertEqual(region.center.latitude, atlanta.latitude, accuracy: 1e-9)
        XCTAssertEqual(region.span.latitudeDelta, MapCameraModel.zoneSpanDegrees, accuracy: 1e-3)
    }

    // MARK: Count label

    func testCountLabelPrimaryAndBreakdown() {
        let shown = [
            deal("f1", category: .food), deal("f2", category: .food),
            deal("g1", category: .groceries),
            deal("c1", category: .home, campusSlug: "gsu")
        ]
        let label = MapCameraModel.countLabel(shown: shown, totalMappable: shown)
        XCTAssertEqual(label.primary, "4 deals in this area")
        XCTAssertEqual(label.breakdown, "2 food · 1 grocery · 1 campus")
        XCTAssertNil(label.hint)   // nothing hidden
    }

    func testCountLabelHintShownWhenFilterHidesDeals() {
        let total = (0..<28).map { deal("d\($0)") }
        let shown = Array(total.prefix(9))
        let label = MapCameraModel.countLabel(shown: shown, totalMappable: total)
        XCTAssertEqual(label.hint, "Showing 9 of 28 — tap Filters to widen.")
    }

    func testCountLabelSingularUnit() {
        let label = MapCameraModel.countLabel(shown: [deal("a")], totalMappable: [deal("a")])
        XCTAssertEqual(label.primary, "1 deal in this area")
    }

    func testCountLabelOmitsZeroBuckets() {
        let shown = [deal("f1", category: .food)]
        let label = MapCameraModel.countLabel(shown: shown, totalMappable: shown)
        XCTAssertEqual(label.breakdown, "1 food")
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

    func testRouteSummaryFormatsEtaAndDistance() {
        XCTAssertEqual(MapCameraModel.routeSummary(distanceMeters: 3218.7, etaSeconds: 600), "10 min · 2.0 mi")
        XCTAssertEqual(MapCameraModel.routeSummary(distanceMeters: 80, etaSeconds: 40), "1 min · <0.1 mi")
    }


    func testClusterMarkersGroupsNearbyAndKeepsCount() {
        func mk(_ id: String, _ lat: Double, _ lng: Double) -> PlaceMarker {
            PlaceMarker(id: id, name: id, category: .food, latitude: lat, longitude: lng,
                        priceBucket: nil, rating: nil, whyRecommended: nil, budgetTip: nil,
                        primaryPhotoUrl: nil, imageStatus: nil, kind: .food)
        }
        // three almost on top of each other + one far away → 2 clusters, counts 3 and 1
        let markers = [mk("a",33.750,-84.386), mk("b",33.7501,-84.3861), mk("c",33.7502,-84.3862), mk("far",33.80,-84.30)]
        let clusters = MapCameraModel.clusterMarkers(markers, radiusMiles: 5)
        XCTAssertEqual(clusters.count, 2)
        XCTAssertEqual(clusters.map(\.count).sorted(), [1, 3])
        XCTAssertEqual(MapCameraModel.clusterMarkers([], radiusMiles: 5).count, 0)
    }

}
