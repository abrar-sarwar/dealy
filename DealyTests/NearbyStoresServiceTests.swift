import XCTest
import CoreLocation
@testable import Dealy

final class NearbyStoresServiceTests: XCTestCase {
    private let atl = CLLocationCoordinate2D(latitude: 33.7531, longitude: -84.3857)

    func testMakeComputesDistanceMilesFromOrigin() {
        let here = NearbyStores.make(name: "Apple Lenox", address: "A", phone: nil, url: nil,
                                     lat: 33.7531, lng: -84.3857, origin: atl)
        XCTAssertLessThan(here.distanceMiles, 1.0)

        // ~1 degree of latitude north ≈ 69 miles.
        let far = NearbyStores.make(name: "Apple Far", address: "B", phone: nil, url: nil,
                                    lat: 34.7531, lng: -84.3857, origin: atl)
        XCTAssertEqual(far.distanceMiles, 69, accuracy: 3)
    }

    func testSortedByDistanceIsNearestFirst() {
        let a = NearbyStores.make(name: "far", address: "", phone: nil, url: nil,
                                  lat: 34.75, lng: -84.39, origin: atl)
        let b = NearbyStores.make(name: "near", address: "", phone: nil, url: nil,
                                  lat: 33.76, lng: -84.39, origin: atl)
        XCTAssertEqual(NearbyStores.sortedByDistance([a, b]).map(\.name), ["near", "far"])
    }

    func testMockReturnsSortedCannedStores() async throws {
        let far = NearbyStores.make(name: "Far", address: "", phone: nil, url: nil,
                                    lat: 34.75, lng: -84.39, origin: atl)
        let near = NearbyStores.make(name: "Near", address: "3393 Peachtree", phone: "404",
                                     url: nil, lat: 33.76, lng: -84.39, origin: atl)
        let mock = MockNearbyStoresService(stores: [far, near])
        let results = try await mock.search(brand: "Apple Store", near: atl)
        XCTAssertEqual(results.map(\.name), ["Near", "Far"])
    }
}
