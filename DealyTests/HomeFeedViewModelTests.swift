import XCTest
@testable import Dealy

// MARK: - Helpers

private func makeDeal(
    id: String,
    verified: Bool = false,
    isOnline: Bool = false,
    expiresInSeconds: TimeInterval = 3600 * 24
) -> Deal {
    Deal(
        id: id,
        title: id,
        merchant: "TestMerchant",
        category: .food,
        currentPrice: 5,
        originalPrice: 10,
        distanceMiles: 1,
        expirationDate: Date().addingTimeInterval(expiresInSeconds),
        dealScore: 50,
        isOnline: isOnline,
        shortDescription: "short",
        detailedDescription: "detail",
        terms: "terms",
        locationTags: ["Atlanta"],
        couponCode: nil,
        destinationURL: nil,
        latitude: nil,
        longitude: nil,
        visualSeed: 0,
        publishedAt: Date(),
        verified: verified
    )
}

/// A `DealServicing` stub that returns a fixed set of deals per request type.
private final class StubDealService: DealServicing {
    var nearbyDeals: [Deal]
    var localDeals: [Deal]

    init(nearbyDeals: [Deal] = [], localDeals: [Deal] = []) {
        self.nearbyDeals = nearbyDeals
        self.localDeals = localDeals
    }

    func fetchDeals(for request: DealFeedRequest) async throws -> DealPage {
        switch request {
        case .local:
            return DealPage(items: localDeals, nextCursor: nil)
        case .nearby, .anywhere:
            return DealPage(items: nearbyDeals, nextCursor: nil)
        case .student:
            return DealPage(items: [], nextCursor: nil)
        case .trending:
            return DealPage(items: [], nextCursor: nil)
        case .missed:
            return DealPage(items: [], nextCursor: nil)
        }
    }
}

// MARK: - Tests

@MainActor
final class HomeFeedViewModelTests: XCTestCase {

    // MARK: deduped(_:_:) unit tests

    func testDedupedPrefersPrimaryOnConflict() {
        let primary = makeDeal(id: "A", verified: true)
        let secondary = makeDeal(id: "A", verified: false)

        let result = HomeFeedViewModel.deduped([primary], [secondary])

        XCTAssertEqual(result.count, 1)
        XCTAssertTrue(result[0].verified, "Primary (allDeals) copy should win on id collision")
    }

    func testDedupedIncludesUniqueSecondaryDeals() {
        let primary = makeDeal(id: "A", verified: true)
        let secondary = makeDeal(id: "B", verified: false)

        let result = HomeFeedViewModel.deduped([primary], [secondary])

        XCTAssertEqual(result.count, 2)
        XCTAssertTrue(result.contains { $0.id == "A" })
        XCTAssertTrue(result.contains { $0.id == "B" })
    }

    func testDedupedNoDuplicatesWhenNoConflict() {
        let a = makeDeal(id: "X")
        let b = makeDeal(id: "Y")
        let c = makeDeal(id: "Z")

        let result = HomeFeedViewModel.deduped([a], [b, c])

        XCTAssertEqual(result.count, 3)
        XCTAssertEqual(Set(result.map(\.id)), ["X", "Y", "Z"])
    }

    func testDedupedEmptySecondaryReturnsAllPrimary() {
        let deals = [makeDeal(id: "1"), makeDeal(id: "2")]
        let result = HomeFeedViewModel.deduped(deals, [])
        XCTAssertEqual(result.map(\.id), deals.map(\.id))
    }

    func testDedupedEmptyPrimaryReturnsAllSecondary() {
        let deals = [makeDeal(id: "1"), makeDeal(id: "2")]
        let result = HomeFeedViewModel.deduped([], deals)
        XCTAssertEqual(result.map(\.id), deals.map(\.id))
    }

    // MARK: rebuild integration tests

    /// Given allDeals = [A (verified)] and localDeals = [B (curated), A' (duplicate, unverified)],
    /// after rebuild the deck should contain B, contain A exactly once, and A retains verified == true.
    func testRebuildBlendsLocalDealsAndDeduplicatesPrefersAllDeals() async {
        let dealA = makeDeal(id: "deal-A", verified: true)
        // A' is the same id as A but with verified == false (simulates the local copy)
        let dealADuplicate = makeDeal(id: "deal-A", verified: false)
        let dealB = makeDeal(id: "deal-B", verified: false)

        let stub = StubDealService(
            nearbyDeals: [dealA],
            localDeals: [dealB, dealADuplicate]
        )
        let app = AppState(
            store: InMemoryPreferencesStore(.default),
            dealService: stub,
            locationProvider: MockLocationProvider(),
            redemptionHandler: MockRedemptionHandler(),
            interactionRecorder: NoopInteractionRecorder()
        )

        // Load both feeds
        await app.loadDeals()
        await app.loadLocalDeals()

        let vm = HomeFeedViewModel()
        vm.rebuild(using: app)

        let deckIDs = vm.deck.map(\.id)

        // B must be in the deck
        XCTAssertTrue(deckIDs.contains("deal-B"), "Curated local deal B should appear in the swipe deck")

        // A must appear exactly once
        let aCount = deckIDs.filter { $0 == "deal-A" }.count
        XCTAssertEqual(aCount, 1, "deal-A should appear exactly once (deduped)")

        // The surviving A should retain verified == true (allDeals copy wins)
        let survivingA = vm.deck.first { $0.id == "deal-A" }
        XCTAssertNotNil(survivingA)
        XCTAssertTrue(survivingA!.verified, "The allDeals (verified) copy of deal-A must be preferred over the local copy")
    }

    func testRebuildWithOnlyAllDealsUnchanged() async {
        let dealA = makeDeal(id: "deal-A", verified: true)
        let stub = StubDealService(nearbyDeals: [dealA], localDeals: [])
        let app = AppState(
            store: InMemoryPreferencesStore(.default),
            dealService: stub,
            locationProvider: MockLocationProvider(),
            redemptionHandler: MockRedemptionHandler(),
            interactionRecorder: NoopInteractionRecorder()
        )
        await app.loadDeals()
        await app.loadLocalDeals()

        let vm = HomeFeedViewModel()
        vm.rebuild(using: app)

        XCTAssertEqual(vm.deck.count, 1)
        XCTAssertEqual(vm.deck.first?.id, "deal-A")
    }

    func testRebuildExcludesSwipedDeals() async {
        let dealA = makeDeal(id: "deal-A", verified: true)
        let dealB = makeDeal(id: "deal-B", verified: false)
        let stub = StubDealService(nearbyDeals: [dealA], localDeals: [dealB])
        let app = AppState(
            store: InMemoryPreferencesStore(.default),
            dealService: stub,
            locationProvider: MockLocationProvider(),
            redemptionHandler: MockRedemptionHandler(),
            interactionRecorder: NoopInteractionRecorder()
        )
        await app.loadDeals()
        await app.loadLocalDeals()

        // Swipe deal-B away
        app.recordSwipe(dealID: "deal-B", direction: .left)

        let vm = HomeFeedViewModel()
        vm.rebuild(using: app)

        XCTAssertFalse(vm.deck.map(\.id).contains("deal-B"), "Swiped deal should be excluded from the deck")
    }
}
