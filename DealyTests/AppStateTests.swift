import XCTest
@testable import Dealy

@MainActor
final class AppStateTests: XCTestCase {

    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func makeApp(
        _ initial: PersistedState = .default,
        locationProvider: LocationProviding = MockLocationProvider(),
        interactionRecorder: DealInteractionRecording = NoopInteractionRecorder()
    ) -> AppState {
        AppState(store: InMemoryPreferencesStore(initial),
                 dealService: MockDealService(reference: Date(timeIntervalSince1970: 1_750_000_000),
                                              artificialDelay: .zero),
                 locationProvider: locationProvider,
                 redemptionHandler: MockRedemptionHandler(),
                 interactionRecorder: interactionRecorder)
    }

    private func withDiscovery(_ preference: DiscoveryPreference) -> PersistedState {
        var state = PersistedState.default
        state.discovery = preference
        return state
    }

    func testLoadPopulatesDeals() async {
        let app = makeApp()
        await app.loadDeals()
        XCTAssertEqual(app.loadState, .loaded)
        // Default discovery is Nearby (Atlanta), which now returns physical deals
        // only — online deals are never blended in (spec §6).
        XCTAssertGreaterThanOrEqual(app.allDeals.count, 20)
        XCTAssertTrue(app.allDeals.allSatisfy { !$0.isOnline })
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

    func testSetDiscoveryPersistsDeviceCenterWithoutFallback() {
        let store = InMemoryPreferencesStore()
        let app = AppState(store: store,
                           dealService: MockDealService(artificialDelay: .zero))
        let expected = DiscoveryPreference.nearby(
            center: DiscoveryCenter(
                latitude: 34.0722,
                longitude: -84.2941,
                displayName: "Current location",
                source: .device
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
            locationProvider: MockLocationProvider()
        )
        let preference = DiscoveryPreference.nearby(
            center: DiscoveryCenter(
                latitude: 34.0522,
                longitude: -118.2437,
                displayName: "Current location",
                source: .device
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
            locationProvider: MockLocationProvider(authorization: .authorizedWhenInUse, result: .success(center))
        )

        try await app.refreshFromDeviceLocation()

        XCTAssertEqual(app.discovery.center, center)
        XCTAssertEqual(app.discovery.mode, .nearby)
    }

    // MARK: - Permission-aware discovery + Anywhere fallback

    func testDefaultRadiusIsTenMiles() {
        XCTAssertEqual(DiscoveryPreference.defaultRadius, 10)
    }

    func testDeniedLocationFallsBackToAnywhere() async {
        let app = makeApp(
            locationProvider: MockLocationProvider(authorization: .denied, result: .failure(.denied))
        )
        let error = await app.enableNearbyOrFallbackToAnywhere()
        XCTAssertEqual(error, .denied)
        XCTAssertEqual(app.discovery.mode, .anywhere)
    }

    func testEnableNearbyAfterPermissionBecomesAvailable() async {
        // Start in Anywhere (e.g. user previously denied), then grant + enable.
        let center = DiscoveryCenter(latitude: 47.6, longitude: -122.3,
                                     displayName: "Current location", source: .device)
        let app = makeApp(
            locationProvider: MockLocationProvider(authorization: .authorizedWhenInUse,
                                                   result: .success(center))
        )
        await app.switchToAnywhere()
        XCTAssertEqual(app.discovery.mode, .anywhere)

        let error = await app.switchToNearby()
        XCTAssertNil(error)
        XCTAssertEqual(app.discovery.mode, .nearby)
        XCTAssertEqual(app.discovery.center, center)
    }

    func testTemporaryFailureKeepsLastValidDeviceLocation() async {
        // A prior device fix is staged; a transient failure must preserve it.
        let lastValid = DiscoveryCenter(latitude: 40.0, longitude: -83.0,
                                        displayName: "Current location", source: .device)
        let initial = withDiscovery(.nearby(center: lastValid, radiusMiles: 10))
        let app = makeApp(
            initial,
            locationProvider: MockLocationProvider(authorization: .authorizedWhenInUse,
                                                   result: .failure(.timeout))
        )
        let error = await app.switchToNearby()
        XCTAssertNil(error)
        XCTAssertEqual(app.discovery.mode, .nearby)
        XCTAssertEqual(app.discovery.center, lastValid) // last valid preserved
    }

    func testNoValidLocationFallsBackToAnywhere() async {
        // No real device fix has ever been recorded (legacy center) + provider
        // fails → use Anywhere rather than fabricated/default coordinates.
        let app = makeApp(
            locationProvider: MockLocationProvider(authorization: .denied, result: .failure(.denied))
        )
        let error = await app.switchToNearby()
        XCTAssertEqual(error, .denied)
        XCTAssertEqual(app.discovery.mode, .anywhere)
    }

    func testRadiusChangeImmediatelyReloadsHome() async {
        let service = RecordingDealService()
        let app = AppState(store: InMemoryPreferencesStore(), dealService: service)
        await app.setRadiusAndReload(42)
        XCTAssertEqual(app.discovery.radiusMiles, 42)
        // A reload was triggered for the new preference.
        XCTAssertEqual(service.requests.count, 1)
    }

    func testRadiusChangeClampsToBounds() async {
        let app = makeApp()
        await app.setRadiusAndReload(500)
        XCTAssertEqual(app.discovery.radiusMiles, DiscoveryPreference.maxRadius)
        await app.setRadiusAndReload(0)
        XCTAssertEqual(app.discovery.radiusMiles, DiscoveryPreference.minRadius)
    }

    func testAnywhereNudgeCanBeDismissed() {
        let app = makeApp()
        XCTAssertFalse(app.anywhereNudgeDismissed)
        app.dismissAnywhereNudge()
        XCTAssertTrue(app.anywhereNudgeDismissed)
    }

    // MARK: - Onboarding with device location

    func testPrepareDiscoveryForOnboardingAutomaticallyUsesDeviceLocation() async {
        let center = DiscoveryCenter(
            latitude: 33.7756,
            longitude: -84.3963,
            displayName: "Current location",
            source: .device
        )
        let app = makeApp(
            locationProvider: MockLocationProvider(
                authorization: .authorizedWhenInUse,
                result: .success(center)
            )
        )

        await app.prepareDiscoveryForOnboarding()

        XCTAssertEqual(app.discovery.mode, .nearby)
        XCTAssertEqual(app.discovery.center, center)
        XCTAssertEqual(app.discovery.radiusMiles, 10)
    }

    func testPrepareDiscoveryForOnboardingFallsBackToAnywhere() async {
        let app = makeApp(
            locationProvider: MockLocationProvider(
                authorization: .denied,
                result: .failure(.denied)
            )
        )

        await app.prepareDiscoveryForOnboarding()

        XCTAssertEqual(app.discovery.mode, .anywhere)
    }

    func testDeviceLocationCanCompleteOnboarding() async throws {
        let center = DiscoveryCenter(
            latitude: 47.6062,
            longitude: -122.3321,
            displayName: "Current location",
            source: .device
        )
        let app = makeApp(
            locationProvider: MockLocationProvider(
                authorization: .authorizedWhenInUse,
                result: .success(center)
            )
        )

        try await app.refreshFromDeviceLocation()
        app.completeOnboarding(interests: [.food])

        XCTAssertTrue(app.hasCompletedOnboarding)
        XCTAssertEqual(app.discovery.center, center)
        XCTAssertEqual(app.discovery.radiusMiles, 10)
    }

    func testCompleteOnboardingWithInterestsPreservesSelectedDiscovery() async {
        let app = makeApp()
        let preference = DiscoveryPreference.nearby(center: .legacyCampus(.uga), radiusMiles: 22)
        await app.applyDiscovery(preference)

        app.completeOnboarding(interests: [.tech])

        XCTAssertTrue(app.hasCompletedOnboarding)
        XCTAssertEqual(app.discovery, preference)
        XCTAssertEqual(app.interests, [.tech])
    }

    // MARK: - Search-owned discovery (Task 6)

    func testChangingSearchDiscoveryPreservesSavedDeals() async {
        let app = makeApp()
        await app.loadDeals()
        app.save("food-bogo-pizza")
        let replacement = DiscoveryPreference.nearby(
            center: .legacyCampus(.uga),
            radiusMiles: 25
        )

        await app.applyDiscovery(replacement)

        XCTAssertEqual(app.discovery, replacement)
        XCTAssertTrue(app.isSaved("food-bogo-pizza"))
    }

    // MARK: - Interaction signals (Task 7)

    func testSwipeRecordsDirection() async {
        let recorder = RecordingInteractionRecorder()
        let app = makeApp(interactionRecorder: recorder)
        await app.loadDeals()
        app.recordSwipe(dealID: "food-wings", direction: .left)
        XCTAssertEqual(recorder.events, [.swiped(dealID: "food-wings", direction: .left)])
    }

    func testOpeningDetailRecordsOpened() {
        let recorder = RecordingInteractionRecorder()
        let app = makeApp(interactionRecorder: recorder)
        app.recordOpened("tech-monitor")
        XCTAssertEqual(recorder.events, [.opened(dealID: "tech-monitor")])
    }

    func testImpressionsAreDedupedPerSession() {
        let recorder = RecordingInteractionRecorder()
        let app = makeApp(interactionRecorder: recorder)
        app.recordImpression("d1")
        app.recordImpression("d1") // duplicate within session — dropped
        app.recordImpression("d2")
        XCTAssertEqual(recorder.events, [.impression(dealID: "d1"), .impression(dealID: "d2")])
    }

    func testGetDealRecordsRedemptionClicked() {
        let recorder = RecordingInteractionRecorder()
        let app = makeApp(interactionRecorder: recorder)
        app.recordRedemptionClicked("tech-monitor")
        XCTAssertEqual(recorder.events, [.redemptionClicked(dealID: "tech-monitor")])
    }

    func testMarkUsedRecordsMarkedUsed() async {
        let recorder = RecordingInteractionRecorder()
        let app = makeApp(interactionRecorder: recorder)
        await app.loadDeals()
        let deal = try! XCTUnwrap(app.deal(id: "food-bogo-pizza"))
        XCTAssertTrue(app.markUsed(deal))
        XCTAssertEqual(recorder.events, [.markedUsed(dealID: "food-bogo-pizza")])
    }

    func testChangingLocationRecordsNoInteractionAndPreservesHistory() async {
        let recorder = RecordingInteractionRecorder()
        let app = makeApp(interactionRecorder: recorder)
        await app.loadDeals()
        app.recordSwipe(dealID: "food-wings", direction: .right)
        let before = recorder.events

        await app.applyDiscovery(.nearby(center: .legacyCampus(.uga), radiusMiles: 25))

        // Changing location is not an interaction signal and must not erase history.
        XCTAssertEqual(recorder.events, before)
        XCTAssertTrue(app.swipedDealIDs.contains("food-wings"))
    }
}

/// Test recorder that accumulates every interaction event.
final class RecordingInteractionRecorder: DealInteractionRecording {
    private(set) var events: [DealInteractionEvent] = []
    func record(_ event: DealInteractionEvent) { events.append(event) }
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
