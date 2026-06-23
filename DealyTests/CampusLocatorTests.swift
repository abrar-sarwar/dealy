import XCTest
import CoreLocation
@testable import Dealy

final class CampusLocatorTests: XCTestCase {

    func testNilCoordinateIsUnavailable() {
        XCTAssertEqual(CampusLocator.locate(from: nil), .unavailable)
    }

    func testCoordinateOnCampusAssignsThatCampus() {
        // Standing on Georgia Tech.
        let coord = CLLocationCoordinate2D(latitude: 33.7756, longitude: -84.3963)
        guard case let .assigned(campus, distance) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .assigned")
        }
        XCTAssertEqual(campus.id, "gt")
        XCTAssertLessThan(distance, 1.0)
    }

    func testNearestWinsBetweenGsuAndGt() {
        // Downtown, closer to GSU than GT.
        let coord = CLLocationCoordinate2D(latitude: 33.7531, longitude: -84.3857)
        guard case let .assigned(campus, _) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .assigned")
        }
        XCTAssertEqual(campus.id, "gsu")
    }

    func testAthensAssignsUga() {
        let coord = CLLocationCoordinate2D(latitude: 33.9480, longitude: -83.3773)
        guard case let .assigned(campus, _) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .assigned")
        }
        XCTAssertEqual(campus.id, "uga")
    }

    func testFarCoordinateIsOutOfRangeWithNearestRetained() {
        // Miami, FL — far from every campus; nearest of the four is UGA.
        let coord = CLLocationCoordinate2D(latitude: 25.7617, longitude: -80.1918)
        guard case let .outOfRange(nearest, distance) = CampusLocator.locate(from: coord) else {
            return XCTFail("expected .outOfRange")
        }
        XCTAssertEqual(nearest.id, "uga")
        XCTAssertGreaterThan(distance, CampusLocator.campusMatchRadiusMiles)
    }

    func testAtlantaMetaAnchorIsNeverMatched() {
        // The `atl` meta-anchor must not be a matchable campus.
        XCTAssertFalse(CampusLocator.matchableCampuses.contains { $0.id == "atl" })
        XCTAssertEqual(CampusLocator.matchableCampuses.map(\.id).sorted(), ["gsu", "gt", "ksu", "uga"])
    }

    func testJustOutsideThresholdIsOutOfRange() {
        // ~31 miles due north of UGA stays out of range (KSU/others are farther).
        let coord = CLLocationCoordinate2D(latitude: 33.9480 + 31.0 / 69.0, longitude: -83.3773)
        if case .assigned = CampusLocator.locate(from: coord) {
            XCTFail("expected out of range just beyond 30mi")
        }
    }
}
