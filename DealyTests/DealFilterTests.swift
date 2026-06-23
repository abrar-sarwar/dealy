import XCTest
@testable import Dealy

final class DealFilterTests: XCTestCase {

    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func deal(_ id: String, category: DealCategory, distance: Double,
                      online: Bool = false, tags: [String], expiresInHours: Double = 24,
                      title: String = "Deal", merchant: String = "Store",
                      currentPrice: Decimal = 5, originalPrice: Decimal = 10,
                      score: Int = 80, publishedHoursAgo: Double = 12) -> Deal {
        Deal(id: id, title: title, merchant: merchant, category: category,
             currentPrice: currentPrice, originalPrice: originalPrice, distanceMiles: distance,
             expirationDate: ref.addingTimeInterval(expiresInHours * 3600),
             dealScore: score, isOnline: online, shortDescription: "s",
             detailedDescription: "d", terms: "t", locationTags: tags,
             couponCode: nil, destinationURL: nil, latitude: nil, longitude: nil,
             visualSeed: 0, publishedAt: ref.addingTimeInterval(-publishedHoursAgo * 3600))
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

    func testByDiscoveryNearbyReturnsPhysicalOnlyNeverOnline() {
        // Nearby never blends online deals (spec §6): a sparse local feed stays
        // honest rather than being padded with online inventory.
        let local = (0..<7).map { deal("l\($0)", category: .food, distance: 2, tags: ["Atlanta"]) }
        let online = (0..<5).map { deal("o\($0)", category: .tech, distance: 0, online: true, tags: ["Online"]) }
        let preference = DiscoveryPreference.nearby(center: .legacyCampus(.atlanta), radiusMiles: 10)

        let result = DealFilter.byDiscovery(local + online, preference: preference, reference: ref)

        XCTAssertEqual(result.count, 7)
        XCTAssertTrue(result.allSatisfy { !$0.isOnline })
    }

    func testByDiscoveryNearbyExcludesOutOfRangeLocalDeals() {
        let near = deal("near", category: .food, distance: 4, tags: ["Atlanta"])
        let far = deal("far", category: .food, distance: 40, tags: ["Atlanta"])
        let preference = DiscoveryPreference.nearby(center: .legacyCampus(.atlanta), radiusMiles: 10)

        let result = DealFilter.byDiscovery([near, far], preference: preference, reference: ref)

        XCTAssertEqual(result.map(\.id), ["near"])
    }

    func testByDiscoveryAnywhereReturnsOnlineOnly() {
        let local = deal("local", category: .food, distance: 1, tags: ["Atlanta"])
        let online = deal("online", category: .tech, distance: 0, online: true, tags: ["Online"])
        let preference = DiscoveryPreference.default.switching(to: .anywhere)

        let result = DealFilter.byDiscovery([local, online], preference: preference, reference: ref)

        XCTAssertEqual(result.map(\.id), ["online"])
    }

    // Far-future expiry so they're active against the default `reference` (now).
    private var onlineDeal: Deal {
        deal("online", category: .tech, distance: 0, online: true, tags: ["Online"], expiresInHours: 1_000_000)
    }
    private var localDeal: Deal {
        deal("local", category: .food, distance: 2, tags: ["Atlanta"], expiresInHours: 1_000_000)
    }

    func testAnywhereEligibilityExcludesPhysicalDeals() {
        let deals = [onlineDeal, localDeal]
        XCTAssertEqual(
            DealFilter.byDiscovery(deals, preference: .default.switching(to: .anywhere)).map(\.id),
            [onlineDeal.id]
        )
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

    func testAdvancedFiltersApplyPriceAndToggles() {
        let matching = deal("match", category: .tech, distance: 1, online: true, tags: ["Online"],
                            expiresInHours: 4, currentPrice: 20, originalPrice: 50)
        let expensive = deal("expensive", category: .tech, distance: 1, online: true, tags: ["Online"],
                             expiresInHours: 4, currentPrice: 80, originalPrice: 100)
        let local = deal("local", category: .tech, distance: 1, tags: ["Atlanta"],
                         expiresInHours: 4, currentPrice: 20, originalPrice: 50)
        let filters = DealFeedFilters(minPrice: 10, maxPrice: 50, onlineOnly: true,
                                      endingSoonOnly: true, strongDiscountOnly: true)

        XCTAssertEqual(DealFilter.advanced([matching, expensive, local], filters: filters, reference: ref).map(\.id),
                       ["match"])
    }

    func testSortOptionsUseRealDealFields() {
        let olderPopular = deal("popular", category: .food, distance: 1, tags: ["Atlanta"],
                                currentPrice: 30, originalPrice: 60, score: 99, publishedHoursAgo: 24)
        let recentCheap = deal("recent", category: .food, distance: 1, tags: ["Atlanta"],
                               currentPrice: 10, originalPrice: 12, score: 70, publishedHoursAgo: 1)

        XCTAssertEqual(DealSortOption.mostPopular.sort([recentCheap, olderPopular]).first?.id, "popular")
        XCTAssertEqual(DealSortOption.mostRecent.sort([olderPopular, recentCheap]).first?.id, "recent")
        XCTAssertEqual(DealSortOption.lowestPrice.sort([olderPopular, recentCheap]).first?.id, "recent")
        XCTAssertEqual(DealSortOption.biggestDiscount.sort([recentCheap, olderPopular]).first?.id, "popular")
    }
}
