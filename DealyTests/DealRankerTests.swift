import XCTest
@testable import Dealy

/// Locks the dollars-first ranking guarantees (Dealy's primary KPI = total
/// dollars saved). Asserts ORDERING, not magic numbers, so constants stay tunable.
final class DealRankerTests: XCTestCase {
    private let campus = Campus.georgiaState
    private let radius = 10
    private let ref = Date(timeIntervalSince1970: 1_750_000_000)

    private func deal(_ id: String, current: Decimal, original: Decimal,
                      online: Bool, distance: Double,
                      category: DealCategory = .food,
                      tags: [String] = [],
                      merchant: String = "M",
                      expiresInHours: Double = 240) -> Deal {
        Deal(
            id: id, title: id, merchant: merchant, category: category,
            currentPrice: current, originalPrice: original, distanceMiles: distance,
            expirationDate: ref.addingTimeInterval(expiresInHours * 3600),
            dealScore: 50, isOnline: online,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: tags, couponCode: nil, destinationURL: nil,
            latitude: nil, longitude: nil, visualSeed: 0, publishedAt: ref
        )
    }

    private func score(_ d: Deal) -> Double {
        DealRanker.score(for: d, interests: [], campus: campus, radius: radius, reference: ref)
    }

    func testHigherDollarsOutranksLowerAtEqualDistance() {
        let big = deal("big", current: 100, original: 300, online: false, distance: 2)   // $200
        let small = deal("small", current: 8, original: 10, online: false, distance: 2)   // $2
        XCTAssertGreaterThan(score(big), score(small))
    }

    func testNearerBeatsFartherAtEqualDollars() {
        // In-range requires a campus tag match (DealFilter.isInRange) AND distance ≤ radius.
        let near = deal("near", current: 50, original: 100, online: false, distance: 1, tags: ["Atlanta"]) // $50
        let far = deal("far", current: 50, original: 100, online: false, distance: 9, tags: ["Atlanta"])   // $50
        XCTAssertGreaterThan(score(near), score(far))
    }

    func testFarHighDollarStillBeatsNearTrivialDollar() {
        // farBig is out of range (80 mi > radius); nearSmall is fully in-range and
        // maximally proximity-boosted — savings must still dominate.
        let farBig = deal("farBig", current: 100, original: 300, online: false, distance: 80, tags: ["Atlanta"]) // $200, OOR
        let nearSmall = deal("nearSmall", current: 5, original: 10, online: false, distance: 1, tags: ["Atlanta"]) // $5
        XCTAssertGreaterThan(score(farBig), score(nearSmall))
    }

    func testOnlineRanksOnDollarsWithoutDistancePenalty() {
        let online = deal("online", current: 50, original: 100, online: true, distance: 0)   // $50
        let farPhysical = deal("far", current: 50, original: 100, online: false, distance: 80) // $50 OOR
        XCTAssertGreaterThan(score(online), score(farPhysical))
    }

    func testPriceZeroProgramNotBuriedUnderTinyDollarDeal() {
        let program = deal("prog", current: 0, original: 0, online: true, distance: 0) // baseline
        let tiny = deal("tiny", current: 9, original: 10, online: true, distance: 0)   // $1
        XCTAssertGreaterThan(score(program), score(tiny))
    }

    func testExpiredSinksBelowActive() {
        let expired = deal("exp", current: 50, original: 100, online: true, distance: 0, expiresInHours: -1)
        let active = deal("act", current: 1, original: 2, online: true, distance: 0)
        XCTAssertLessThan(score(expired), score(active))
    }

    func testStableTiebreakByID() {
        let a = deal("aaa", current: 50, original: 100, online: true, distance: 0)
        let b = deal("bbb", current: 50, original: 100, online: true, distance: 0)
        let ranked = DealRanker.rank([b, a], interests: [], campus: campus, radius: radius, reference: ref)
        XCTAssertEqual(ranked.map(\.id), ["aaa", "bbb"])
    }

    // MARK: Diversity-aware deck ordering

    /// A score-ranked list that is grocery-first (as distance-dominated ranking
    /// produces) should still surface restaurants and respect per-merchant caps in
    /// the first 10 cards.
    func testDiversifiedSurfacesRestaurantsEarlyAndCapsMerchants() {
        var ranked: [Deal] = []
        for i in 0..<10 { ranked.append(deal("aldi\(i)", current: 0, original: 0, online: false, distance: 0.2, category: .groceries, merchant: "Aldi")) }
        for i in 0..<8 { ranked.append(deal("pub\(i)", current: 0, original: 0, online: false, distance: 1, category: .groceries, merchant: "Publix")) }
        for i in 0..<4 { ranked.append(deal("chi\(i)", current: 0, original: 0, online: false, distance: 6, category: .food, merchant: "Chili's")) }
        for i in 0..<4 { ranked.append(deal("app\(i)", current: 0, original: 0, online: false, distance: 7, category: .food, merchant: "Applebee's")) }

        let varied = DealRanker.diversified(ranked)
        let first10 = Array(varied.prefix(10))
        let grocery = first10.filter { $0.category == .groceries }.count
        let food = first10.filter { $0.category == .food }.count
        let perMerchant = Dictionary(grouping: first10, by: \.merchant).mapValues(\.count)

        XCTAssertLessThanOrEqual(grocery, 5, "no more than 5 grocery cards in the first 10")
        XCTAssertGreaterThanOrEqual(food, 2, "at least 2 restaurant/food cards in the first 10")
        XCTAssertTrue(perMerchant.values.allSatisfy { $0 <= 3 }, "no merchant more than 3× in the first 10")
        XCTAssertTrue(varied.prefix(4).contains { $0.category == .food },
                      "a restaurant/food card should appear within the first 4 cards")
        XCTAssertEqual(varied.count, ranked.count, "diversify drops nothing")
    }

    /// Nothing is hidden: a grocery-only list keeps all its deals (caps relax when
    /// no other category exists).
    func testDiversifiedHidesNothingWhenOnlyOneCategory() {
        let ranked = (0..<12).map { deal("g\($0)", current: 0, original: 0, online: false, distance: 0.5, category: .groceries, merchant: "Aldi") }
        let out = DealRanker.diversified(ranked)
        XCTAssertEqual(out.count, 12)
        XCTAssertEqual(Set(out.map(\.id)), Set(ranked.map(\.id)))
    }

    func testReasonsLeadWithDollarsWhenConcrete() {
        let d = deal("d", current: 60, original: 100, online: true, distance: 0) // $40
        let first = DealRanker.reasons(for: d, interests: [], campus: campus, reference: ref).first
        XCTAssertEqual(first?.symbol, "dollarsign.circle.fill")
    }
}
