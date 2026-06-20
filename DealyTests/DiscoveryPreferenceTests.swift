import XCTest
@testable import Dealy

final class DiscoveryPreferenceTests: XCTestCase {

    func testNearbyPreferenceClampsRadiusToSupportedRange() {
        let center = DiscoveryCenter(
            latitude: 33.7531,
            longitude: -84.3857,
            displayName: "Atlanta, GA",
            source: .device
        )
        XCTAssertEqual(DiscoveryPreference.nearby(center: center, radiusMiles: 0).radiusMiles, 1)
        XCTAssertEqual(DiscoveryPreference.nearby(center: center, radiusMiles: 101).radiusMiles, 100)
    }

    func testAnywherePreservesLastNearbyCenter() {
        let nearby = DiscoveryPreference.nearby(center: .legacyCampus(.georgiaTech), radiusMiles: 10)
        let anywhere = nearby.switching(to: .anywhere)
        XCTAssertEqual(anywhere.mode, .anywhere)
        XCTAssertEqual(anywhere.center, nearby.center)
        XCTAssertEqual(anywhere.radiusMiles, 10)
    }
}
