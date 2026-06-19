import XCTest
@testable import Dealy

final class PersistenceTests: XCTestCase {

    func testPersistedStateRoundTrips() throws {
        var state = PersistedState()
        state.hasCompletedOnboarding = true
        state.campusID = Campus.uga.id
        state.radius = 9
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

    func testStoreSaveLoad() {
        let store = InMemoryPreferencesStore()
        var state = PersistedState()
        state.radius = 11
        store.save(state)
        XCTAssertEqual(store.load().radius, 11)
    }

    func testDefaultStateIsFirstRun() {
        XCTAssertFalse(PersistedState.default.hasCompletedOnboarding)
        XCTAssertEqual(PersistedState.default.campusID, Campus.georgiaState.id)
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
