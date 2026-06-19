import XCTest
@testable import Dealy

final class DealFilterTests: XCTestCase {

    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func deal(_ id: String, category: DealCategory, distance: Double,
                      online: Bool = false, tags: [String], expiresInHours: Double = 24,
                      title: String = "Deal", merchant: String = "Store") -> Deal {
        Deal(id: id, title: title, merchant: merchant, category: category,
             currentPrice: 5, originalPrice: 10, distanceMiles: distance,
             expirationDate: ref.addingTimeInterval(expiresInHours * 3600),
             dealScore: 80, isOnline: online, shortDescription: "s",
             detailedDescription: "d", terms: "t", locationTags: tags,
             couponCode: nil, destinationURL: nil, latitude: nil, longitude: nil, visualSeed: 0)
    }

    func testCategoryFilter() {
        let deals = [deal("1", category: .food, distance: 1, tags: ["Atlanta"]),
                     deal("2", category: .tech, distance: 1, tags: ["Atlanta"])]
        XCTAssertEqual(DealFilter.byCategory(deals, category: .food).map(\.id), ["1"])
        XCTAssertEqual(DealFilter.byCategory(deals, category: nil).count, 2)
    }

    func testLocationInRangeRequiresTagAndRadius() {
        let near = deal("near", category: .food, distance: 2, tags: ["Downtown Atlanta"])
        let tooFar = deal("far", category: .food, distance: 9, tags: ["Downtown Atlanta"])
        let wrongPlace = deal("athens", category: .food, distance: 1, tags: ["Athens"])
        let campus = Campus.georgiaState // radius default 3, tags include Downtown Atlanta
        XCTAssertTrue(DealFilter.isInRange(near, campus: campus, radius: 3))
        XCTAssertFalse(DealFilter.isInRange(tooFar, campus: campus, radius: 3))
        XCTAssertFalse(DealFilter.isInRange(wrongPlace, campus: campus, radius: 3))
    }

    func testOnlineAlwaysInRange() {
        let onlineDeal = deal("online", category: .tech, distance: 0, online: true, tags: ["Online"])
        XCTAssertTrue(DealFilter.isInRange(onlineDeal, campus: .uga, radius: 1))
    }

    func testRadiusWidensResults() {
        let d = deal("d", category: .food, distance: 5, tags: ["Athens"])
        let campus = Campus.uga
        XCTAssertFalse(DealFilter.isInRange(d, campus: campus, radius: 3))
        XCTAssertTrue(DealFilter.isInRange(d, campus: campus, radius: 6))
    }

    func testSearchMatchesTitleMerchantCategory() {
        let deals = [deal("1", category: .food, distance: 1, tags: ["Atlanta"], title: "BOGO Pizza Slices", merchant: "Rosa's"),
                     deal("2", category: .tech, distance: 1, tags: ["Atlanta"], title: "Monitor Deal", merchant: "Micro Center")]
        XCTAssertEqual(DealFilter.search(deals, query: "pizza").map(\.id), ["1"])
        XCTAssertEqual(DealFilter.search(deals, query: "micro").map(\.id), ["2"])
        XCTAssertEqual(DealFilter.search(deals, query: "tech").map(\.id), ["2"])
        XCTAssertEqual(DealFilter.search(deals, query: "").count, 2)
    }

    func testActiveExcludesExpired() {
        let deals = [deal("ok", category: .food, distance: 1, tags: ["Atlanta"], expiresInHours: 10),
                     deal("dead", category: .food, distance: 1, tags: ["Atlanta"], expiresInHours: -2)]
        XCTAssertEqual(DealFilter.active(deals, reference: ref).map(\.id), ["ok"])
    }

    func testRankerPrefersInterestMatch() {
        let foodDeal = deal("food", category: .food, distance: 1, tags: ["Downtown Atlanta"])
        let techDeal = deal("tech", category: .tech, distance: 1, tags: ["Downtown Atlanta"])
        let ranked = DealRanker.rank([techDeal, foodDeal], interests: [.food],
                                     campus: .georgiaState, radius: 3, reference: ref)
        XCTAssertEqual(ranked.first?.id, "food")
    }
}
