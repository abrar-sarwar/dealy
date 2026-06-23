import XCTest
@testable import Dealy

/// Covers the real backend interaction recorder: event→endpoint mapping, that
/// events actually reach the API, that payloads carry no precise coordinates, and
/// that tracking is fire-and-forget (never blocks the caller).
final class InteractionRecorderTests: XCTestCase {

    func testRouteMappingForEachEvent() {
        XCTAssertEqual(
            RemoteInteractionRecorder.route(for: .impression(dealID: "d1")).path,
            "/v1/deals/d1/impressions"
        )
        XCTAssertEqual(
            RemoteInteractionRecorder.route(for: .opened(dealID: "d1")).path,
            "/v1/deals/d1/opens"
        )
        let swipe = RemoteInteractionRecorder.route(for: .swiped(dealID: "d1", direction: .right))
        XCTAssertEqual(swipe.path, "/v1/deals/d1/swipes")
        XCTAssertEqual(swipe.body["direction"] as? String, "right")
        XCTAssertEqual(
            RemoteInteractionRecorder.route(for: .redemptionClicked(dealID: "d1")).path,
            "/v1/deals/d1/clicks"
        )
        let redemption = RemoteInteractionRecorder.route(for: .markedUsed(
            dealID: "d1", savingsAmount: 199.00, campusID: "gt", inventoryClass: "national"))
        XCTAssertEqual(redemption.path, "/v1/deals/d1/redemptions")
        XCTAssertEqual(redemption.body["savings_amount"] as? String, "199")
        XCTAssertEqual(redemption.body["campus_id"] as? String, "gt")
        XCTAssertEqual(redemption.body["inventory_class"] as? String, "national")
    }

    func testRedemptionWithoutCampusOmitsCampusID() {
        let route = RemoteInteractionRecorder.route(for: .markedUsed(
            dealID: "d1", savingsAmount: 12.50, campusID: nil, inventoryClass: "online"))
        XCTAssertNil(route.body["campus_id"])
        XCTAssertEqual(route.body["savings_amount"] as? String, "12.5")
        XCTAssertEqual(route.body["inventory_class"] as? String, "online")
    }

    func testNoPreciseCoordinatesInAnyPayload() {
        let events: [DealInteractionEvent] = [
            .impression(dealID: "d"),
            .opened(dealID: "d"),
            .swiped(dealID: "d", direction: .left),
            .redemptionClicked(dealID: "d"),
            .markedUsed(dealID: "d", savingsAmount: 10, campusID: "gt", inventoryClass: "local"),
        ]
        for event in events {
            let body = RemoteInteractionRecorder.route(for: event).body
            XCTAssertNil(body["latitude"])
            XCTAssertNil(body["longitude"])
            XCTAssertNil(body["lat"])
            XCTAssertNil(body["lng"])
            XCTAssertNil(body["coordinates"])
        }
    }

    func testRecordPostsToTheExpectedEndpoint() async {
        StubURLProtocol.reset()
        let hit = expectation(description: "endpoint hit")
        StubURLProtocol.responder = { _ in
            hit.fulfill()
            return Data("{}".utf8)
        }
        let recorder = RemoteInteractionRecorder(client: Self.stubbedClient())

        recorder.record(.opened(dealID: "abc"))

        await fulfillment(of: [hit], timeout: 2)
        XCTAssertTrue(StubURLProtocol.paths.contains("/v1/deals/abc/opens"))
    }

    func testTrackingFailureDoesNotThrowOrBlock() async {
        StubURLProtocol.reset()
        let hit = expectation(description: "endpoint hit")
        StubURLProtocol.failWithStatus = 500 // server error
        StubURLProtocol.responder = { _ in
            hit.fulfill()
            return Data("{}".utf8)
        }
        let recorder = RemoteInteractionRecorder(client: Self.stubbedClient())

        // record() is synchronous + non-throwing: it returns immediately even
        // though the underlying POST will fail.
        recorder.record(.impression(dealID: "abc"))

        await fulfillment(of: [hit], timeout: 2)
        // No assertion needed beyond "we got here without throwing/hanging".
    }

    // MARK: Authenticated delivery

    func testRemoteCompositionAttachesBearerFromTokenProvider() async {
        StubURLProtocol.reset()
        let hit = expectation(description: "hit")
        StubURLProtocol.responder = { _ in hit.fulfill(); return Data("{}".utf8) }
        let provider = MutableTokenProvider("tok-1")
        let (_, recorder) = RemoteComposition.make(
            baseURL: URL(string: "https://stub.dealy.test")!,
            auth: provider,
            session: Self.stubSession()
        )

        recorder.record(.opened(dealID: "d"))

        await fulfillment(of: [hit], timeout: 2)
        XCTAssertEqual(StubURLProtocol.authHeader(for: "/v1/deals/d/opens"), "Bearer tok-1")
    }

    func testRefreshedTokenIsUsedOnLaterRequests() async {
        let provider = MutableTokenProvider("tok-1")
        let recorder = RemoteInteractionRecorder(client: Self.stubbedClient(auth: provider))

        StubURLProtocol.reset()
        var hit = expectation(description: "first")
        StubURLProtocol.responder = { _ in hit.fulfill(); return Data("{}".utf8) }
        recorder.record(.opened(dealID: "a"))
        await fulfillment(of: [hit], timeout: 2)
        XCTAssertEqual(StubURLProtocol.authHeader(for: "/v1/deals/a/opens"), "Bearer tok-1")

        await provider.set("tok-2") // session refreshed
        StubURLProtocol.reset()
        hit = expectation(description: "second")
        StubURLProtocol.responder = { _ in hit.fulfill(); return Data("{}".utf8) }
        recorder.record(.opened(dealID: "b"))
        await fulfillment(of: [hit], timeout: 2)
        XCTAssertEqual(StubURLProtocol.authHeader(for: "/v1/deals/b/opens"), "Bearer tok-2")
    }

    func testSignedOutSendsNoAuthHeaderAndDoesNotBlock() async {
        StubURLProtocol.reset()
        let hit = expectation(description: "hit")
        StubURLProtocol.responder = { _ in hit.fulfill(); return Data("{}".utf8) }
        // No session → nil token.
        let recorder = RemoteInteractionRecorder(client: Self.stubbedClient(auth: MutableTokenProvider(nil)))

        recorder.record(.impression(dealID: "x"))

        await fulfillment(of: [hit], timeout: 2)
        // No Authorization header attached when signed out.
        XCTAssertEqual(StubURLProtocol.authHeader(for: "/v1/deals/x/impressions"), .some(nil))
    }

    private static func stubSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: config)
    }

    private static func stubbedClient(auth: AuthTokenProviding? = nil) -> APIClient {
        APIClient(
            baseURL: URL(string: "https://stub.dealy.test")!,
            session: stubSession(),
            tokenProvider: { await auth?.currentAccessToken() }
        )
    }
}

/// Mutable, thread-safe token source for tests (models Supabase session refresh).
actor MutableTokenProvider: AuthTokenProviding {
    private var token: String?
    init(_ token: String?) { self.token = token }
    func set(_ token: String?) { self.token = token }
    func currentAccessToken() async -> String? { token }
}
