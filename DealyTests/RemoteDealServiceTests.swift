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

    // MARK: Helpers

    private static func stubbedClient() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return APIClient(baseURL: URL(string: "https://stub.dealy.test")!,
                         session: URLSession(configuration: config))
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
    private static var recordedPaths: [String] = []

    static var paths: [String] {
        lock.lock(); defer { lock.unlock() }
        return recordedPaths
    }

    static func reset() {
        lock.lock(); defer { lock.unlock() }
        recordedPaths = []
        responder = nil
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        StubURLProtocol.lock.lock()
        StubURLProtocol.recordedPaths.append(path)
        let responder = StubURLProtocol.responder
        StubURLProtocol.lock.unlock()

        let data = responder?(path) ?? Data("{}".utf8)
        let response = HTTPURLResponse(url: request.url!, statusCode: 200,
                                       httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
