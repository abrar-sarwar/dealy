import XCTest
@testable import Dealy

/// Covers the discovery-aware feed contract: mock blending/eligibility plus the
/// real `RemoteDealService` endpoint routing (via a stubbed URL session).
final class RemoteDealServiceTests: XCTestCase {

    private let reference = Date(timeIntervalSince1970: 1_750_000_000)

    // MARK: MockDealService feed behavior

    func testNearbyMockFeedIsPhysicalOnlyAndVerified() async throws {
        let service = MockDealService(reference: reference, artificialDelay: .zero)
        let preference = DiscoveryPreference.nearby(center: .legacyCampus(.atlanta), radiusMiles: 25)
        let page = try await service.fetchDeals(for: .nearby(preference))
        XCTAssertFalse(page.items.isEmpty)
        // Nearby never includes online deals (spec §6).
        XCTAssertTrue(page.items.allSatisfy { !$0.isOnline })
        // Mock inventory stands in for verified deals.
        XCTAssertTrue(page.items.allSatisfy(\.verified))
    }

    func testAnywhereMockFeedContainsOnlyOnlineDeals() async throws {
        let service = MockDealService(reference: reference, artificialDelay: .zero)
        let page = try await service.fetchDeals(for: .anywhere)
        XCTAssertFalse(page.items.isEmpty)
        XCTAssertTrue(page.items.allSatisfy(\.isOnline))
    }

    // MARK: RemoteDealService endpoint routing

    func testAnywhereRoutesToOnlineFeedOnly() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.responder = { path in
            XCTAssertEqual(path, "/v1/feeds/online")
            return Self.page(ids: ["o1", "o2"], online: true)
        }
        let service = RemoteDealService(client: Self.stubbedClient())

        let page = try await service.fetchDeals(for: .anywhere)

        XCTAssertEqual(StubURLProtocol.paths, ["/v1/feeds/online"])
        XCTAssertTrue(page.items.allSatisfy(\.isOnline))
        XCTAssertEqual(page.items.map(\.id), ["o1", "o2"])
    }

    func testNearbyRoutesToNearbyFeedOnlyAndNeverBlendsOnline() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.responder = { path in
            switch path {
            case "/v1/feeds/nearby": return Self.page(ids: ["l1", "l2", "l3"], online: false)
            case "/v1/feeds/online": return Self.page(ids: ["o1", "o2"], online: true)
            default:
                XCTFail("Unexpected path \(path)")
                return Data("{}".utf8)
            }
        }
        let preference = DiscoveryPreference.nearby(center: .legacyCampus(.atlanta), radiusMiles: 100)
        let service = RemoteDealService(client: Self.stubbedClient())

        let page = try await service.fetchDeals(for: .nearby(preference))

        // Nearby hits ONLY the nearby feed — the online feed is never queried (spec §6).
        XCTAssertEqual(StubURLProtocol.paths, ["/v1/feeds/nearby"])
        XCTAssertEqual(page.items.map(\.id), ["l1", "l2", "l3"])
        XCTAssertTrue(page.items.allSatisfy { !$0.isOnline })
    }

    func testNearbyLowCoverageReturnsEmptyWithCoverageStatus() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.responder = { _ in
            Data(
                "{\"items\":[],\"nextCursor\":null,\"coverage\":{\"qualified\":false,\"reason\":\"outside_coverage\"}}"
                    .utf8)
        }
        let preference = DiscoveryPreference.nearby(center: .legacyCampus(.atlanta), radiusMiles: 10)
        let service = RemoteDealService(client: Self.stubbedClient())

        let page = try await service.fetchDeals(for: .nearby(preference))

        XCTAssertTrue(page.items.isEmpty)
        XCTAssertEqual(page.coverage?.qualified, false)
        XCTAssertEqual(page.coverage?.reason, "outside_coverage")
    }

    func testNearbyQualifiedCoveragePassesThrough() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.responder = { path in
            XCTAssertEqual(path, "/v1/feeds/nearby")
            return Data(
                "{\"items\":[],\"nextCursor\":null,\"coverage\":{\"qualified\":true,\"reason\":\"qualified\"}}"
                    .utf8)
        }
        let preference = DiscoveryPreference.nearby(center: .legacyCampus(.atlanta), radiusMiles: 10)
        let service = RemoteDealService(client: Self.stubbedClient())

        let page = try await service.fetchDeals(for: .nearby(preference))
        XCTAssertEqual(page.coverage?.qualified, true)
    }

    func testTrendingRoutesToTrendingFeed() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.responder = { path in
            XCTAssertEqual(path, "/v1/feeds/trending")
            return Self.page(ids: ["t1", "t2"], online: false)
        }
        let service = RemoteDealService(client: Self.stubbedClient())
        let page = try await service.fetchDeals(for: .trending)
        XCTAssertEqual(page.items.map(\.id), ["t1", "t2"])
    }

    func testLocalRoutesToLocalFeedWithCoords() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.responder = { path in
            XCTAssertEqual(path, "/v1/feeds/local")
            return Self.page(ids: ["l1", "l2"], online: false)
        }
        let service = RemoteDealService(client: Self.stubbedClient())
        let center = DiscoveryCenter(latitude: 33.7531, longitude: -84.3857,
                                     displayName: "Current location", source: .device)
        let page = try await service.fetchDeals(for: .local(center: center, radiusMiles: 15))
        XCTAssertEqual(page.items.map(\.id), ["l1", "l2"])
    }

    func testMissedRoutesToMissedFeedWithCoords() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.responder = { path in
            XCTAssertEqual(path, "/v1/feeds/missed")
            // Simulate expired items (expiresAt in the past).
            return Self.expiredPage(ids: ["m1", "m2"])
        }
        let service = RemoteDealService(client: Self.stubbedClient())
        let center = DiscoveryCenter(latitude: 33.7531, longitude: -84.3857,
                                     displayName: "Current location", source: .device)
        let page = try await service.fetchDeals(for: .missed(center: center, radiusMiles: 15))
        XCTAssertEqual(StubURLProtocol.paths, ["/v1/feeds/missed"])
        XCTAssertEqual(page.items.map(\.id), ["m1", "m2"])
        // All items returned by /missed have expiresAt in the past → isExpired == true.
        XCTAssertTrue(page.items.allSatisfy(\.isExpired),
                      "every item from /v1/feeds/missed must be expired")
        XCTAssertTrue(page.items.allSatisfy { !$0.isRedeemable },
                      "expired deals from /missed must not be redeemable")
    }

    // MARK: Helpers

    private static func stubbedClient() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return APIClient(baseURL: URL(string: "https://stub.dealy.test")!,
                         session: URLSession(configuration: config))
    }

    /// Minimal DealPageDTO JSON with the given ids and an expiry 1 day in the past.
    private static func expiredPage(ids: [String]) -> Data {
        let items = ids.map { id in
            """
            {
              "id": "\(id)", "title": "\(id)", "merchant": "M", "category": "food",
              "currentPrice": 5, "originalPrice": 10, "currency": "USD",
              "distanceMiles": 1, "dealScore": 80,
              "isOnline": false, "isStudentOnly": false,
              "shortDescription": "s", "detailedDescription": "d", "terms": "t",
              "couponCode": null, "destinationUrl": null,
              "latitude": null, "longitude": null,
              "locationTags": ["Atlanta"],
              "visualSeed": 0,
              "publishedAt": "2025-01-01T00:00:00Z",
              "startAt": null,
              "expiresAt": "2025-01-02T00:00:00Z"
            }
            """
        }.joined(separator: ",")
        return Data("{\"items\":[\(items)],\"nextCursor\":null}".utf8)
    }

    /// Minimal DealPageDTO JSON with the given ids.
    private static func page(ids: [String], online: Bool) -> Data {
        let items = ids.map { id in
            """
            {
              "id": "\(id)", "title": "\(id)", "merchant": "M", "category": "food",
              "currentPrice": 5, "originalPrice": 10, "currency": "USD",
              "distanceMiles": \(online ? "null" : "1"), "dealScore": 80,
              "isOnline": \(online), "isStudentOnly": false,
              "shortDescription": "s", "detailedDescription": "d", "terms": "t",
              "couponCode": null, "destinationUrl": null,
              "latitude": null, "longitude": null,
              "locationTags": ["\(online ? "Online" : "Atlanta")"],
              "visualSeed": 0,
              "publishedAt": "2026-01-01T00:00:00Z",
              "startAt": null,
              "expiresAt": "2099-01-01T00:00:00Z"
            }
            """
        }.joined(separator: ",")
        return Data("{\"items\":[\(items)],\"nextCursor\":null}".utf8)
    }
}

/// URLProtocol stub that records requested paths and returns canned JSON.
final class StubURLProtocol: URLProtocol {
    static let lock = NSLock()
    static var responder: ((String) -> Data)?
    /// When set, all responses use this HTTP status (for failure-path tests).
    static var failWithStatus: Int?
    private static var recordedPaths: [String] = []
    private static var recordedAuth: [String: String?] = [:]

    static var paths: [String] {
        lock.lock(); defer { lock.unlock() }
        return recordedPaths
    }

    /// The Authorization header seen for the most recent request to `path`.
    static func authHeader(for path: String) -> String?? {
        lock.lock(); defer { lock.unlock() }
        return recordedAuth[path]
    }

    static func reset() {
        lock.lock(); defer { lock.unlock() }
        recordedPaths = []
        recordedAuth = [:]
        responder = nil
        failWithStatus = nil
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        StubURLProtocol.lock.lock()
        StubURLProtocol.recordedPaths.append(path)
        StubURLProtocol.recordedAuth[path] = request.value(forHTTPHeaderField: "Authorization")
        let responder = StubURLProtocol.responder
        StubURLProtocol.lock.unlock()

        let data = responder?(path) ?? Data("{}".utf8)
        let status = StubURLProtocol.failWithStatus ?? 200
        let response = HTTPURLResponse(url: request.url!, statusCode: status,
                                       httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
