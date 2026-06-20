import XCTest
@testable import Dealy

final class PersistenceTests: XCTestCase {

    private struct LegacyPersistedStatePayload: Encodable {
        let hasCompletedOnboarding: Bool
        let campusID: String?
        let radius: Int?
        let interests: Set<DealCategory>
        let savedDealIDs: [String]
        let watchedDealIDs: Set<String>
        let swipeHistory: [SwipeAction]
        let savingsEvents: [SavingsEvent]
        let notificationsEnabled: Bool
    }

    func testPersistedStateRoundTrips() throws {
        var state = PersistedState()
        state.hasCompletedOnboarding = true
        state.discovery = .nearby(center: .legacyCampus(.uga), radiusMiles: 9)
        state.interests = [.food, .books, .tech]
        state.savedDealIDs = ["a", "b", "c"]
        state.watchedDealIDs = ["b"]
        state.swipeHistory = [SwipeAction(dealID: "a", direction: .right, wasSavedBefore: false)]
        state.savingsEvents = [SavingsEvent(dealID: "a", dealTitle: "A", amount: Decimal(12.50))]
        state.notificationsEnabled = true

        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(PersistedState.self, from: data)
        XCTAssertEqual(decoded, state)
    }

    func testPersistedStateEncodesDiscoveryWithoutLegacyCampusKeys() throws {
        var state = PersistedState()
        state.discovery = .nearby(center: .legacyCampus(.georgiaTech), radiusMiles: 11)

        let data = try JSONEncoder().encode(state)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNotNil(json["discovery"])
        XCTAssertNil(json["campusID"])
        XCTAssertNil(json["radius"])
    }

    func testLegacyPersistedStateDecodesIntoDiscoveryPreference() throws {
        let payload = LegacyPersistedStatePayload(
            hasCompletedOnboarding: true,
            campusID: "uga",
            radius: 9,
            interests: [],
            savedDealIDs: [],
            watchedDealIDs: [],
            swipeHistory: [],
            savingsEvents: [],
            notificationsEnabled: false
        )
        let json = try JSONEncoder().encode(payload)

        let decoded = try JSONDecoder().decode(PersistedState.self, from: json)
        XCTAssertEqual(decoded.discovery.center.displayName, Campus.uga.name)
        XCTAssertEqual(decoded.discovery.radiusMiles, 9)
        XCTAssertEqual(decoded.discovery.center.source, .legacyCampus)
    }

    func testLegacyPersistedStateDefaultsInvalidLegacyLocationToAtlantaAndTenMiles() throws {
        let payload = LegacyPersistedStatePayload(
            hasCompletedOnboarding: true,
            campusID: "not-a-campus",
            radius: 0,
            interests: [],
            savedDealIDs: [],
            watchedDealIDs: [],
            swipeHistory: [],
            savingsEvents: [],
            notificationsEnabled: false
        )

        let decoded = try JSONDecoder().decode(PersistedState.self, from: JSONEncoder().encode(payload))
        XCTAssertEqual(decoded.discovery.center, .legacyCampus(.atlanta))
        XCTAssertEqual(decoded.discovery.radiusMiles, DiscoveryPreference.defaultRadius)
    }

    func testLegacyPersistedStateDefaultsMissingLegacyLocationToAtlantaAndTenMiles() throws {
        let payload = LegacyPersistedStatePayload(
            hasCompletedOnboarding: false,
            campusID: nil,
            radius: nil,
            interests: [],
            savedDealIDs: [],
            watchedDealIDs: [],
            swipeHistory: [],
            savingsEvents: [],
            notificationsEnabled: false
        )

        let decoded = try JSONDecoder().decode(PersistedState.self, from: JSONEncoder().encode(payload))
        XCTAssertEqual(decoded.discovery.center, .legacyCampus(.atlanta))
        XCTAssertEqual(decoded.discovery.radiusMiles, DiscoveryPreference.defaultRadius)
    }

    func testLegacyPersistedStatePreservesNonLocationFields() throws {
        let swipe = SwipeAction(
            dealID: "deal-1",
            direction: .right,
            wasSavedBefore: true,
            date: Date(timeIntervalSince1970: 1_750_000_123)
        )
        let savings = SavingsEvent(
            dealID: "deal-2",
            dealTitle: "Coffee",
            amount: Decimal(string: "7.25")!,
            date: Date(timeIntervalSince1970: 1_750_000_456)
        )
        let payload = LegacyPersistedStatePayload(
            hasCompletedOnboarding: true,
            campusID: "uga",
            radius: 9,
            interests: [.food, .tech],
            savedDealIDs: ["saved-1", "saved-2"],
            watchedDealIDs: ["watch-1"],
            swipeHistory: [swipe],
            savingsEvents: [savings],
            notificationsEnabled: true
        )

        let decoded = try JSONDecoder().decode(PersistedState.self, from: JSONEncoder().encode(payload))

        XCTAssertTrue(decoded.hasCompletedOnboarding)
        XCTAssertEqual(decoded.interests, [.food, .tech])
        XCTAssertEqual(decoded.savedDealIDs, ["saved-1", "saved-2"])
        XCTAssertEqual(decoded.watchedDealIDs, ["watch-1"])
        XCTAssertEqual(decoded.swipeHistory, [swipe])
        XCTAssertEqual(decoded.savingsEvents, [savings])
        XCTAssertTrue(decoded.notificationsEnabled)
    }

    func testStoreSaveLoad() {
        let store = InMemoryPreferencesStore()
        var state = PersistedState()
        state.discovery = .nearby(center: .legacyCampus(.atlanta), radiusMiles: 11)
        store.save(state)
        XCTAssertEqual(store.load().discovery.radiusMiles, 11)
    }

    func testDefaultStateIsFirstRun() {
        XCTAssertFalse(PersistedState.default.hasCompletedOnboarding)
        XCTAssertEqual(PersistedState.default.discovery, .default)
    }

    @MainActor
    func testHomeFeedExcludesSwipedDeals() async {
        let store = InMemoryPreferencesStore()
        let app = AppState(store: store,
                           dealService: MockDealService(artificialDelay: .zero))
        await app.loadDeals()
        let vm = HomeFeedViewModel()
        vm.rebuild(using: app)
        let initialCount = vm.deck.count
        XCTAssertGreaterThan(initialCount, 0)

        let top = vm.topDeal!
        app.recordSwipe(dealID: top.id, direction: .left)
        vm.popTop()
        vm.rebuild(using: app)
        XCTAssertFalse(vm.deck.contains { $0.id == top.id })
        XCTAssertEqual(vm.deck.count, initialCount - 1)
    }
}
