import XCTest
@testable import Dealy

final class PlaceResolverTests: XCTestCase {

    func testResolverReturnsMultipleCandidatesForAmbiguousQuery() async throws {
        let candidates = [
            PlaceCandidate(displayName: "Athens, GA", latitude: 33.9519, longitude: -83.3576),
            PlaceCandidate(displayName: "Athens, OH", latitude: 39.3292, longitude: -82.1013),
        ]
        let resolver = MockPlaceResolver(result: .success(candidates))

        let resolved = try await resolver.resolve("Athens")
        XCTAssertEqual(resolved, candidates)
    }

    func testResolverReturnsSingleCandidateForUnambiguousQuery() async throws {
        let candidate = PlaceCandidate(displayName: "Atlanta, GA", latitude: 33.7531, longitude: -84.3857)
        let resolver = MockPlaceResolver(result: .success([candidate]))

        let resolved = try await resolver.resolve("Atlanta")
        XCTAssertEqual(resolved, [candidate])
    }

    func testAppleResolverReturnsNoCandidatesForEmptyOrBlankQuery() async throws {
        let resolver = ApplePlaceResolver()
        // Empty / whitespace-only input must short-circuit without hitting the geocoder.
        let empty = try await resolver.resolve("")
        let blank = try await resolver.resolve("   ")
        XCTAssertTrue(empty.isEmpty)
        XCTAssertTrue(blank.isEmpty)
    }

    func testPlaceCandidateMapsToManualDiscoveryCenter() {
        let candidate = PlaceCandidate(displayName: "Chicago, IL", latitude: 41.8781, longitude: -87.6298)
        let center = candidate.center
        XCTAssertEqual(center.latitude, 41.8781)
        XCTAssertEqual(center.longitude, -87.6298)
        XCTAssertEqual(center.displayName, "Chicago, IL")
        XCTAssertEqual(center.source, .manual)
    }
}
