import XCTest
@testable import Dealy

final class DealCategoryFilterTests: XCTestCase {

    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func deal(_ id: String, category: DealCategory = .food,
                      campusSlug: String? = nil, requiresStudentId: Bool = false,
                      audience: String = "general", isStudentOnly: Bool = false,
                      campusDealType: String? = nil) -> Deal {
        var d = Deal(
            id: id, title: id, merchant: "M", category: category,
            currentPrice: 5, originalPrice: 10, distanceMiles: 1,
            expirationDate: ref.addingTimeInterval(24 * 3600),
            dealScore: 50, isOnline: false,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: ["Atlanta"], couponCode: nil, destinationURL: nil,
            latitude: nil, longitude: nil, visualSeed: 0, publishedAt: ref
        )
        d.campusSlug = campusSlug
        d.requiresStudentId = requiresStudentId
        d.audience = audience
        d.isStudentOnly = isStudentOnly
        d.campusDealType = campusDealType
        return d
    }

    func testAllMatchesEverything() {
        XCTAssertTrue(DealCategoryFilter.all.matches(deal("x", category: .tech)))
    }

    func testFoodMatchesFoodOnly() {
        XCTAssertTrue(DealCategoryFilter.food.matches(deal("a", category: .food)))
        XCTAssertFalse(DealCategoryFilter.food.matches(deal("b", category: .groceries)))
    }

    func testGroceryMatchesGroceriesOnly() {
        XCTAssertTrue(DealCategoryFilter.grocery.matches(deal("a", category: .groceries)))
        XCTAssertFalse(DealCategoryFilter.grocery.matches(deal("b", category: .food)))
    }

    func testEntertainmentMatchesEntertainmentOnly() {
        XCTAssertTrue(DealCategoryFilter.entertainment.matches(deal("a", category: .entertainment)))
        XCTAssertFalse(DealCategoryFilter.entertainment.matches(deal("b", category: .food)))
    }

    func testCampusMatchesWhenCampusSlugPresent() {
        XCTAssertTrue(DealCategoryFilter.campus.matches(deal("a", campusSlug: "gsu")))
        XCTAssertFalse(DealCategoryFilter.campus.matches(deal("b", campusSlug: nil)))
    }

    func testStudentMatchesStudentSignals() {
        XCTAssertTrue(DealCategoryFilter.student.matches(deal("a", requiresStudentId: true)))
        XCTAssertTrue(DealCategoryFilter.student.matches(deal("b", audience: "students")))
        XCTAssertTrue(DealCategoryFilter.student.matches(deal("c", isStudentOnly: true)))
        XCTAssertFalse(DealCategoryFilter.student.matches(deal("d")))
    }

    func testServicesMatchesNonConsumerUtilityOffers() {
        XCTAssertTrue(DealCategoryFilter.services.matches(
            deal("a", category: .home, campusDealType: "other")))
        XCTAssertTrue(DealCategoryFilter.services.matches(
            deal("b", category: .home, campusDealType: "transport")))
    }

    func testServicesDoesNotMatchFoodDeal() {
        XCTAssertFalse(DealCategoryFilter.services.matches(
            deal("food", category: .food, campusDealType: nil)))
        // A food deal that somehow had a consumer campusDealType is still not Services.
        XCTAssertFalse(DealCategoryFilter.services.matches(
            deal("food2", category: .food, campusDealType: "student_discount")))
    }

    func testServicesLabelAndSymbol() {
        XCTAssertEqual(DealCategoryFilter.services.label, "Services")
        XCTAssertEqual(DealCategoryFilter.services.symbol, "wrench.and.screwdriver.fill")
    }

    func testByCategoryFilter() {
        let deals = [deal("1", category: .food), deal("2", category: .groceries)]
        XCTAssertEqual(DealFilter.byCategoryFilter(deals, .food).map(\.id), ["1"])
        XCTAssertEqual(DealFilter.byCategoryFilter(deals, .all).count, 2)
    }

    func testAvailableFiltersExcludesZeroMatches() {
        // Only food + grocery deals present; no campus/student/entertainment.
        let deals = [deal("1", category: .food), deal("2", category: .groceries)]
        let available = DealFilter.availableFilters(in: deals)
        XCTAssertEqual(available, [.all, .food, .grocery])
        XCTAssertFalse(available.contains(.campus))
        XCTAssertFalse(available.contains(.student))
        XCTAssertFalse(available.contains(.entertainment))
    }

    func testCountIsCorrect() {
        let deals = [deal("1", category: .food),
                     deal("2", category: .food),
                     deal("3", category: .groceries, campusSlug: "gsu")]
        XCTAssertEqual(DealFilter.count(deals, for: .food), 2)
        XCTAssertEqual(DealFilter.count(deals, for: .grocery), 1)
        XCTAssertEqual(DealFilter.count(deals, for: .campus), 1)
        XCTAssertEqual(DealFilter.count(deals, for: .all), 3)
    }
}
