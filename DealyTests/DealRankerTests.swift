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
                      expiresInHours: Double = 240) -> Deal {
        Deal(
            id: id, title: id, merchant: "M", category: category,
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

    func testReasonsLeadWithDollarsWhenConcrete() {
        let d = deal("d", current: 60, original: 100, online: true, distance: 0) // $40
        let first = DealRanker.reasons(for: d, interests: [], campus: campus, reference: ref).first
        XCTAssertEqual(first?.symbol, "dollarsign.circle.fill")
    }
}
