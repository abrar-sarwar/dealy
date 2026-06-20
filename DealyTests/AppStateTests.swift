import XCTest
@testable import Dealy

@MainActor
final class AppStateTests: XCTestCase {

    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func makeApp(_ initial: PersistedState = .default) -> AppState {
        AppState(store: InMemoryPreferencesStore(initial),
                 dealService: MockDealService(reference: Date(timeIntervalSince1970: 1_750_000_000),
                                              artificialDelay: .zero),
                 redemptionHandler: MockRedemptionHandler())
    }

    func testLoadPopulatesDeals() async {
        let app = makeApp()
        await app.loadDeals()
        XCTAssertEqual(app.loadState, .loaded)
        XCTAssertGreaterThanOrEqual(app.allDeals.count, 36)
        XCTAssertNotNil(app.deal(id: "food-bogo-pizza"))
    }

    func testSaveAndUnsave() async {
        let app = makeApp()
        await app.loadDeals()
        XCTAssertFalse(app.isSaved("food-bogo-pizza"))
        app.save("food-bogo-pizza")
        XCTAssertTrue(app.isSaved("food-bogo-pizza"))
        XCTAssertEqual(app.savedCount, 1)
        // Saving twice does not duplicate.
        app.save("food-bogo-pizza")
        XCTAssertEqual(app.savedCount, 1)
        app.unsave("food-bogo-pizza")
        XCTAssertFalse(app.isSaved("food-bogo-pizza"))
        XCTAssertEqual(app.savedCount, 0)
    }

    func testToggleWatch() async {
        let app = makeApp()
        await app.loadDeals()
        XCTAssertFalse(app.isWatched("tech-monitor"))
        XCTAssertTrue(app.toggleWatched("tech-monitor"))
        XCTAssertTrue(app.isWatched("tech-monitor"))
        XCTAssertFalse(app.toggleWatched("tech-monitor"))
        XCTAssertFalse(app.isWatched("tech-monitor"))
    }

    func testRightSwipeSavesAndRecordsHistory() async {
        let app = makeApp()
        await app.loadDeals()
        app.recordSwipe(dealID: "food-wings", direction: .right)
        XCTAssertTrue(app.isSaved("food-wings"))
        XCTAssertTrue(app.swipedDealIDs.contains("food-wings"))
        XCTAssertEqual(app.lastSwipe?.dealID, "food-wings")
    }

    func testLeftSwipeDoesNotSave() async {
        let app = makeApp()
        await app.loadDeals()
        app.recordSwipe(dealID: "food-wings", direction: .left)
        XCTAssertFalse(app.isSaved("food-wings"))
        XCTAssertTrue(app.swipedDealIDs.contains("food-wings"))
    }

    func testUndoRestoresPreviousSavedState() async {
        let app = makeApp()
        await app.loadDeals()
        // Deal was not saved before; right swipe saves it; undo should unsave.
        app.recordSwipe(dealID: "food-wings", direction: .right)
        XCTAssertTrue(app.isSaved("food-wings"))
        let restored = app.undoLastSwipe()
        XCTAssertEqual(restored, "food-wings")
        XCTAssertFalse(app.isSaved("food-wings"))
        XCTAssertFalse(app.swipedDealIDs.contains("food-wings"))
        XCTAssertNil(app.lastSwipe)
    }

    func testUndoKeepsAlreadySavedDeal() async {
        let app = makeApp()
        await app.loadDeals()
        app.save("food-wings")                          // pre-saved
        app.recordSwipe(dealID: "food-wings", direction: .right)
        _ = app.undoLastSwipe()
        // It was saved before the swipe, so undo must keep it saved.
        XCTAssertTrue(app.isSaved("food-wings"))
    }

    func testUndoOnEmptyHistoryReturnsNil() async {
        let app = makeApp()
        await app.loadDeals()
        XCTAssertNil(app.undoLastSwipe())
    }

    func testMarkUsedAddsSavingsOnce() async {
        let app = makeApp()
        await app.loadDeals()
        let deal = try! XCTUnwrap(app.deal(id: "food-bogo-pizza"))
        XCTAssertEqual(money(deal.savingsAmount), 6.0, accuracy: 0.005)

        XCTAssertTrue(app.markUsed(deal))
        XCTAssertEqual(money(app.totalRealizedSavings), 6.0, accuracy: 0.005)
        // Marking again must not double count.
        XCTAssertFalse(app.markUsed(deal))
        XCTAssertEqual(money(app.totalRealizedSavings), 6.0, accuracy: 0.005)
        XCTAssertTrue(app.hasBeenUsed(deal.id))
    }

    func testPotentialSavingsSumsSavedDeals() async {
        let app = makeApp()
        await app.loadDeals()
        app.save("food-bogo-pizza")  // saves $6
        app.save("tech-logi-mouse")  // 39.99 - 19.99 = $20
        XCTAssertEqual(money(app.totalPotentialSavings), 26.0, accuracy: 0.005)
    }

    private func money(_ d: Decimal) -> Double { NSDecimalNumber(decimal: d).doubleValue }

    func testCompleteOnboardingPersists() async {
        let store = InMemoryPreferencesStore()
        let app = AppState(store: store,
                           dealService: MockDealService(artificialDelay: .zero))
        app.completeOnboarding(campus: .georgiaTech, radius: 5, interests: [.tech, .food])
        XCTAssertTrue(app.hasCompletedOnboarding)
        XCTAssertEqual(app.currentCampus.id, Campus.georgiaTech.id)
        XCTAssertEqual(app.radius, 5)
        // Reloading from the same store recovers the state.
        let reloaded = store.load()
        XCTAssertTrue(reloaded.hasCompletedOnboarding)
        XCTAssertEqual(reloaded.discovery.center, .legacyCampus(.georgiaTech))
        XCTAssertEqual(reloaded.discovery.radiusMiles, 5)
        XCTAssertEqual(reloaded.interests, [.tech, .food])
    }

    func testSetDiscoveryPersistsManualCenterWithoutFallback() {
        let store = InMemoryPreferencesStore()
        let app = AppState(store: store,
                           dealService: MockDealService(artificialDelay: .zero))
        let expected = DiscoveryPreference.nearby(
            center: DiscoveryCenter(
                latitude: 34.0722,
                longitude: -84.2941,
                displayName: "Alpharetta, GA",
                source: .manual
            ),
            radiusMiles: 18,
            updatedAt: ref
        )

        app.setDiscovery(expected)

        XCTAssertEqual(app.discovery, expected)
        XCTAssertEqual(store.load().discovery, expected)
    }

    func testResetDealHistoryKeepsSaved() async {
        let app = makeApp()
        await app.loadDeals()
        app.save("food-bogo-pizza")
        app.recordSwipe(dealID: "food-wings", direction: .left)
        let deal = app.deal(id: "food-bogo-pizza")!
        _ = app.markUsed(deal)

        app.resetDealHistory()
        XCTAssertTrue(app.swipedDealIDs.isEmpty)
        XCTAssertEqual(app.totalRealizedSavings, 0)
        XCTAssertTrue(app.isSaved("food-bogo-pizza")) // saved deals preserved
    }

    func testRadiusClamping() {
        let app = makeApp()
        app.setRadius(100)
        XCTAssertEqual(app.discovery.radiusMiles, DiscoveryPreference.maxRadius)
        app.setRadius(0)
        XCTAssertEqual(app.discovery.radiusMiles, DiscoveryPreference.minRadius)
    }

    func testSelectingCampusWithRadiusUpdatesBothLocationFilters() {
        let app = makeApp()

        app.selectCampus(.georgiaTech, radius: 12)

        XCTAssertEqual(app.currentCampus, .georgiaTech)
        XCTAssertEqual(app.discovery.center, .legacyCampus(.georgiaTech))
        XCTAssertEqual(app.discovery.radiusMiles, 12)
    }

    // MARK: - Discovery-aware loading (Task 3)

    func testApplyingDiscoveryReloadsUsingNewPreference() async {
        let service = RecordingDealService()
        let app = AppState(
            store: InMemoryPreferencesStore(),
            dealService: service,
            locationProvider: MockLocationProvider(),
            placeResolver: MockPlaceResolver()
        )
        let preference = DiscoveryPreference.nearby(
            center: DiscoveryCenter(
                latitude: 34.0522,
                longitude: -118.2437,
                displayName: "Los Angeles, CA",
                source: .manual
            ),
            radiusMiles: 25
        )

        await app.applyDiscovery(preference)

        XCTAssertEqual(app.discovery, preference)
        XCTAssertEqual(service.requests, [.nearby(preference)])
    }

    func testLateFeedResponseCannotReplaceNewerLocation() async {
        let service = ControllableDealService()
        let app = AppState(store: InMemoryPreferencesStore(), dealService: service)

        // Start the older load and wait until it reaches the service (generation 1).
        let first = Task { await app.applyDiscovery(.nearby(center: .legacyCampus(.atlanta), radiusMiles: 10)) }
        await service.waitForRequest(centerName: Campus.atlanta.name)
        // Start the newer load and wait until it reaches the service (generation 2).
        let second = Task { await app.applyDiscovery(.nearby(center: .legacyCampus(.uga), radiusMiles: 10)) }
        await service.waitForRequest(centerName: Campus.uga.name)

        // The newer (generation 2) response arrives first and wins; the older
        // (generation 1) response arrives late and must be discarded.
        service.finishSecond(with: [Fixtures.athensDeal])
        service.finishFirst(with: [Fixtures.atlantaDeal])

        _ = await (first.value, second.value)
        XCTAssertEqual(app.allDeals.map(\.id), [Fixtures.athensDeal.id])
    }

    func testRefreshFromDeviceLocationAppliesDeviceCenter() async throws {
        let center = DiscoveryCenter(
            latitude: 47.6062,
            longitude: -122.3321,
            displayName: "Current location",
            source: .device
        )
        let app = AppState(
            store: InMemoryPreferencesStore(),
            dealService: RecordingDealService(),
            locationProvider: MockLocationProvider(authorization: .authorizedWhenInUse, result: .success(center)),
            placeResolver: MockPlaceResolver()
        )

        try await app.refreshFromDeviceLocation()

        XCTAssertEqual(app.discovery.center, center)
        XCTAssertEqual(app.discovery.mode, .nearby)
    }

    func testResolvePlacesForwardsToResolver() async throws {
        let candidate = PlaceCandidate(displayName: "Chicago, IL", latitude: 41.8781, longitude: -87.6298)
        let app = AppState(
            store: InMemoryPreferencesStore(),
            dealService: RecordingDealService(),
            locationProvider: MockLocationProvider(),
            placeResolver: MockPlaceResolver(result: .success([candidate]))
        )

        let results = try await app.resolvePlaces("60601")
        XCTAssertEqual(results, [candidate])
    }
}

// MARK: - Test doubles

/// Records every feed request it receives; returns a fixed (empty) page.
final class RecordingDealService: DealServicing {
    private(set) var requests: [DealFeedRequest] = []
    var page = DealPage(items: [], nextCursor: nil)

    func fetchDeals(for request: DealFeedRequest) async throws -> DealPage {
        requests.append(request)
        return page
    }
}

/// Completion is controlled by the test and keyed by the request's center, so it
/// is independent of the order in which the (off-actor) fetches actually run.
/// Results are buffered so finishing before or after the fetch both work.
/// `finishFirst` targets the first applied discovery (Atlanta), `finishSecond`
/// the second (UGA).
final class ControllableDealService: DealServicing {
    private let lock = NSLock()
    private var continuations: [String: CheckedContinuation<DealPage, Error>] = [:]
    private var ready: [String: DealPage] = [:]
    private var registered: Set<String> = []
    private var requestWaiters: [String: CheckedContinuation<Void, Never>] = [:]

    func fetchDeals(for request: DealFeedRequest) async throws -> DealPage {
        let key = Self.key(for: request)
        return try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            registered.insert(key)
            let waiter = requestWaiters.removeValue(forKey: key)
            if let page = ready.removeValue(forKey: key) {
                lock.unlock()
                waiter?.resume()
                continuation.resume(returning: page)
            } else {
                continuations[key] = continuation
                lock.unlock()
                waiter?.resume()
            }
        }
    }

    /// Suspends until a fetch for `centerName` has been received by the service.
    func waitForRequest(centerName: String) async {
        await withCheckedContinuation { continuation in
            lock.lock()
            if registered.contains(centerName) {
                lock.unlock()
                continuation.resume()
            } else {
                requestWaiters[centerName] = continuation
                lock.unlock()
            }
        }
    }

    func finishFirst(with deals: [Deal]) { complete(Campus.atlanta.name, deals) }
    func finishSecond(with deals: [Deal]) { complete(Campus.uga.name, deals) }

    private func complete(_ key: String, _ deals: [Deal]) {
        let page = DealPage(items: deals, nextCursor: nil)
        lock.lock()
        if let continuation = continuations.removeValue(forKey: key) {
            lock.unlock()
            continuation.resume(returning: page)
        } else {
            ready[key] = page
            lock.unlock()
        }
    }

    private static func key(for request: DealFeedRequest) -> String {
        switch request {
        case .nearby(let preference): return preference.center.displayName
        case .anywhere: return "anywhere"
        }
    }
}

enum Fixtures {
    static func deal(id: String, online: Bool) -> Deal {
        Deal(
            id: id, title: id, merchant: "Merchant", category: .food,
            currentPrice: 5, originalPrice: 10, distanceMiles: online ? 0 : 1,
            expirationDate: .distantFuture, dealScore: 80, isOnline: online,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: online ? ["Online"] : ["Atlanta"],
            couponCode: nil, destinationURL: nil, latitude: nil, longitude: nil,
            visualSeed: 0, publishedAt: .distantPast
        )
    }

    static let atlantaDeal = deal(id: "atl-deal", online: false)
    static let athensDeal = deal(id: "ath-deal", online: false)
}
