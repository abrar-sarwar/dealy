import XCTest
import CoreLocation
@testable import Dealy

/// Tests for `DirectionsLauncher.url(to:name:provider:)` — verifies the Apple
/// Maps directions deep link is structured correctly. Structured so a `.google`
/// case can be added with its own assertions later.
final class DirectionsLauncherTests: XCTestCase {

    private let gsu = CLLocationCoordinate2D(latitude: 33.7531, longitude: -84.3863)

    func testAppleMapsURLHasExpectedHostAndQuery() {
        let url = DirectionsLauncher.url(to: gsu, name: "Atlanta Ballet", provider: .apple)
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!

        XCTAssertEqual(components.scheme, "https")
        XCTAssertEqual(components.host, "maps.apple.com")

        let items = Dictionary(uniqueKeysWithValues:
            (components.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(items["ll"], "33.7531,-84.3863")
        XCTAssertEqual(items["daddr"], "33.7531,-84.3863")
        XCTAssertEqual(items["q"], "Atlanta Ballet")
        XCTAssertEqual(items["dirflg"], "d")
    }

    func testAppleMapsURLEncodesNameWithSpaces() {
        let url = DirectionsLauncher.url(to: gsu, name: "The Varsity Diner", provider: .apple)
        // The name must be percent-encoded in the resulting absolute string.
        XCTAssertTrue(url.absoluteString.contains("The%20Varsity%20Diner"))
    }

    func testDefaultProviderIsApple() {
        let explicit = DirectionsLauncher.url(to: gsu, name: "X", provider: .apple)
        let defaulted = DirectionsLauncher.url(to: gsu, name: "X")
        XCTAssertEqual(explicit, defaulted)
    }
}
