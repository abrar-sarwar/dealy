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
        XCTAssertEqual(reloaded.campusID, Campus.georgiaTech.id)
        XCTAssertEqual(reloaded.interests, [.tech, .food])
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
        XCTAssertEqual(app.radius, Campus.maxRadius)
        app.setRadius(0)
        XCTAssertEqual(app.radius, Campus.minRadius)
    }

    func testSelectingCampusWithRadiusUpdatesBothLocationFilters() {
        let app = makeApp()

        app.selectCampus(.georgiaTech, radius: 12)

        XCTAssertEqual(app.currentCampus, .georgiaTech)
        XCTAssertEqual(app.radius, 12)
    }
}
