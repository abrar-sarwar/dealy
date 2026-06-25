import XCTest
@testable import Dealy

final class MapFilterStateTests: XCTestCase {

    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func deal(_ id: String,
                      category: DealCategory = .food,
                      distance: Double = 1,
                      precision: String = "exact",
                      requiresStudentId: Bool = false,
                      campusSlug: String? = nil,
                      imageURL: String? = nil,
                      current: Decimal = 5,
                      original: Decimal = 10,
                      merchant: String = "M",
                      expiresInHours: Double = 240,
                      campusDealType: String? = nil) -> Deal {
        var d = Deal(
            id: id, title: id, merchant: merchant, category: category,
            currentPrice: current, originalPrice: original, distanceMiles: distance,
            expirationDate: ref.addingTimeInterval(expiresInHours * 3600),
            dealScore: 50, isOnline: false,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: ["Atlanta"], couponCode: nil, destinationURL: nil,
            latitude: 33.75, longitude: -84.39, visualSeed: 0, publishedAt: ref
        )
        d.locationPrecision = precision
        d.requiresStudentId = requiresStudentId
        d.campusSlug = campusSlug
        d.imageURL = imageURL
        d.campusDealType = campusDealType
        return d
    }

    // MARK: isDefault

    func testIsDefaultAtConstruction() {
        XCTAssertTrue(MapFilterState().isDefault)
    }

    func testDefaultsAreShowAll() {
        let s = MapFilterState()
        XCTAssertEqual(s.category, .all)
        XCTAssertEqual(s.sort, .best)
        XCTAssertFalse(s.exactOnly)
    }

    /// Radius is no longer a sheet filter — `MapFilterState` must not expose it,
    /// and adding/removing the slider value must never affect `isDefault`/`summary`.
    func testRadiusIsNotASheetFilter() {
        // A default state is "default" regardless of any external radius value;
        // there is simply no radius member to mutate here.
        let s = MapFilterState()
        XCTAssertTrue(s.isDefault)
        XCTAssertEqual(s.summary, "Filters")
        XCTAssertEqual(s.activeCount, 0)
    }

    func testNotDefaultAfterChange() {
        var s = MapFilterState()
        s.category = .food
        XCTAssertFalse(s.isDefault)
    }

    // MARK: summary

    func testSummaryDefault() {
        XCTAssertEqual(MapFilterState().summary, "Filters")
    }

    func testSummarySingleCategory() {
        var s = MapFilterState()
        s.category = .food
        XCTAssertEqual(s.summary, "Food")
    }

    func testSummarySingleSort() {
        var s = MapFilterState()
        s.sort = .nearest
        XCTAssertEqual(s.summary, "Nearest")
    }

    func testSummarySingleToggle() {
        var s = MapFilterState()
        s.exactOnly = true
        XCTAssertEqual(s.summary, "Exact only")
    }

    func testSummaryTwoOrMore() {
        var s = MapFilterState()
        s.category = .food
        s.sort = .nearest
        XCTAssertEqual(s.summary, "Filters · 2")
    }

    func testSummaryThreeFilters() {
        var s = MapFilterState()
        s.category = .food
        s.sort = .nearest
        s.exactOnly = true
        XCTAssertEqual(s.summary, "Filters · 3")
    }

    // MARK: toggles compose into predicate

    func testExactOnlyTogglePredicate() {
        var s = MapFilterState()
        s.exactOnly = true
        XCTAssertTrue(s.togglesPass(deal("a", precision: "exact")))
        XCTAssertFalse(s.togglesPass(deal("b", precision: "approximate")))
    }

    func testStudentIDTogglePredicate() {
        var s = MapFilterState()
        s.studentIDRequired = true
        XCTAssertTrue(s.togglesPass(deal("a", requiresStudentId: true)))
        XCTAssertFalse(s.togglesPass(deal("b", requiresStudentId: false)))
    }

    func testCampusPerksTogglePredicate() {
        var s = MapFilterState()
        s.campusPerksOnly = true
        XCTAssertTrue(s.togglesPass(deal("a", campusSlug: "gsu")))
        XCTAssertFalse(s.togglesPass(deal("b", campusSlug: nil)))
    }

    func testHasRealImageTogglePredicate() {
        var s = MapFilterState()
        s.hasRealImage = true
        XCTAssertTrue(s.togglesPass(deal("a", imageURL: "https://x/y.jpg")))
        XCTAssertFalse(s.togglesPass(deal("b", imageURL: nil)))
        XCTAssertFalse(s.togglesPass(deal("c", imageURL: "")))
    }

    // MARK: apply (category + radius + toggles compose)

    func testApplyComposesCategoryAndToggles() {
        // Radius is NOT applied here anymore — only category + toggles. Both food
        // deals are exact, so the far one survives `apply` (radius is the slider's job).
        let deals = [
            deal("food-near-exact", category: .food, distance: 2, precision: "exact"),
            deal("food-far-exact", category: .food, distance: 9, precision: "exact"),
            deal("food-near-approx", category: .food, distance: 2, precision: "approximate"),
            deal("groc-near", category: .groceries, distance: 1, precision: "exact")
        ]
        var s = MapFilterState()
        s.category = .food
        s.exactOnly = true
        let result = s.apply(to: deals)
        XCTAssertEqual(Set(result.map(\.id)), ["food-near-exact", "food-far-exact"])
    }

    func testApplyDoesNotFilterByDistance() {
        // No radius member → distance is irrelevant to `apply`.
        let deals = [
            deal("a", distance: 1), deal("b", category: .groceries, distance: 4),
            deal("c", category: .entertainment, distance: 14)
        ]
        XCTAssertEqual(Set(MapFilterState().apply(to: deals).map(\.id)), ["a", "b", "c"])
    }

    // MARK: MapSort ordering

    private func rank(_ deals: [Deal]) -> [Deal] {
        DealRanker.diversified(
            DealRanker.rank(deals, interests: [], campus: .atlanta, radius: 15, reference: ref))
    }

    func testNearestOrdersByDistance() {
        let deals = [deal("far", distance: 9), deal("near", distance: 1), deal("mid", distance: 4)]
        let out = MapSort.nearest.ordered(deals, ranked: rank(deals), reference: ref)
        XCTAssertEqual(out.map(\.id), ["near", "mid", "far"])
    }

    func testEndingSoonOrdersByExpiration() {
        let deals = [
            deal("late", expiresInHours: 200),
            deal("soon", expiresInHours: 5),
            deal("mid", expiresInHours: 50)
        ]
        let out = MapSort.endingSoon.ordered(deals, ranked: rank(deals), reference: ref)
        XCTAssertEqual(out.map(\.id), ["soon", "mid", "late"])
    }

    func testFoodFirstPutsFoodAhead() {
        let deals = [
            deal("groc", category: .groceries, distance: 1),
            deal("food", category: .food, distance: 8)
        ]
        let out = MapSort.foodFirst.ordered(deals, ranked: rank(deals), reference: ref)
        XCTAssertEqual(out.first?.category, .food)
    }

    func testBestDemotesWeakCampusPerks() {
        // A strong-dollar real food deal should outrank a weak "other"-type perk.
        let strong = deal("strong", category: .food, distance: 2, current: 50, original: 250)
        let weak = deal("weak", category: .home, distance: 1, current: 5, original: 10,
                        campusDealType: "other")
        let out = MapSort.best.ordered([weak, strong], ranked: rank([weak, strong]), reference: ref)
        XCTAssertEqual(out.first?.id, "strong")
        XCTAssertEqual(out.last?.id, "weak")
    }
}
