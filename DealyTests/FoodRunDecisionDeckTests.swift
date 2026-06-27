import XCTest
@testable import Dealy

/// Verifies the Food Run decision-card deck: goal mapping for each preset and the
/// pure late-night time-gating helper (no view dependencies).
final class FoodRunDecisionDeckTests: XCTestCase {

    func testDecisionCardGoalMapping() {
        let byTitle = Dictionary(uniqueKeysWithValues: FoodRunDecisionDeck.all.map { ($0.title, $0.goal) })
        XCTAssertEqual(byTitle["Best lunch move today"], .quickLunch)
        XCTAssertEqual(byTitle["Under $10 near you"], .under10)
        XCTAssertEqual(byTitle["Best study spot nearby"], .studySpot)
        XCTAssertEqual(byTitle["Quick bite near campus"], .quickLunch)
        XCTAssertEqual(byTitle["Worth the walk"], .bestValue)
        XCTAssertEqual(byTitle["Late-night move"], .lateNight)
    }

    func testAllSpecsHaveStableUniqueIdentitiesAndContent() {
        let ids = FoodRunDecisionDeck.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count, "Decision-card titles (ids) must be unique")
        for spec in FoodRunDecisionDeck.all {
            XCTAssertFalse(spec.title.isEmpty)
            XCTAssertFalse(spec.subtitle.isEmpty)
            XCTAssertFalse(spec.symbol.isEmpty)
        }
    }

    func testLateNightCardHiddenBefore8pm() {
        for hour in [0, 6, 11, 14, 19] {
            let goals = FoodRunDecisionDeck.visibleCards(hour: hour).map(\.goal)
            XCTAssertFalse(goals.contains(.lateNight), "Late-night card should be hidden at hour \(hour)")
        }
    }

    func testLateNightCardShownAt8pmAndLater() {
        for hour in [20, 21, 23] {
            let goals = FoodRunDecisionDeck.visibleCards(hour: hour).map(\.goal)
            XCTAssertTrue(goals.contains(.lateNight), "Late-night card should be shown at hour \(hour)")
        }
    }

    func testOnlyLateNightCardIsTimeGated() {
        // Day vs. night differ by exactly the single late-night card.
        let day = FoodRunDecisionDeck.visibleCards(hour: 12)
        let night = FoodRunDecisionDeck.visibleCards(hour: 22)
        XCTAssertEqual(day.count, FoodRunDecisionDeck.all.count - 1)
        XCTAssertEqual(night.count, FoodRunDecisionDeck.all.count)
        // Every non-late-night card appears regardless of hour.
        let nonLateNight = FoodRunDecisionDeck.all.filter { $0.goal != .lateNight }
        XCTAssertEqual(Set(day.map(\.id)), Set(nonLateNight.map(\.id)))
    }
}
