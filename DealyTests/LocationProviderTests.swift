import XCTest
@testable import Dealy

@MainActor
final class LocationProviderTests: XCTestCase {

    func testMockLocationProviderReturnsConfiguredCenter() async throws {
        let expected = DiscoveryCenter(
            latitude: 40.7128,
            longitude: -74.0060,
            displayName: "Current location",
            source: .device
        )
        let provider = MockLocationProvider(
            authorization: .authorizedWhenInUse,
            result: .success(expected)
        )

        let center = try await provider.currentCenter()
        XCTAssertEqual(center, expected)
    }

    func testDeniedLocationThrowsTypedError() async {
        let provider = MockLocationProvider(
            authorization: .denied,
            result: .failure(.denied)
        )

        do {
            _ = try await provider.currentCenter()
            XCTFail("Expected denied")
        } catch {
            XCTAssertEqual(error as? LocationProviderError, .denied)
        }
    }

    func testRestrictedLocationThrowsTypedError() async {
        let provider = MockLocationProvider(
            authorization: .restricted,
            result: .failure(.restricted)
        )

        do {
            _ = try await provider.currentCenter()
            XCTFail("Expected restricted")
        } catch {
            XCTAssertEqual(error as? LocationProviderError, .restricted)
        }
    }

    func testMockReportsConfiguredAuthorizationAndRequestEchoesIt() async {
        let provider = MockLocationProvider(authorization: .authorizedWhenInUse)
        XCTAssertEqual(provider.authorization, .authorizedWhenInUse)
        let granted = await provider.requestWhenInUseAuthorization()
        XCTAssertEqual(granted, .authorizedWhenInUse)
    }
}
