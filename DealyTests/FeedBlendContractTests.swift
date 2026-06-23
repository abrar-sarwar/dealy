import XCTest
@testable import Dealy

/// Encodes the core product rule as an executable guarantee: campus state can
/// reorder/boost the feed but can NEVER remove non-local deals. Also covers the
/// four-class InventoryClass blend.
final class FeedBlendContractTests: XCTestCase {

    private func catalog() -> [Deal] { MockDeals.dataset(reference: Date()) }

    func testCampusStateNeverRemovesNonLocalDeals() {
        let deals = catalog()
        let online = Set(deals.filter { $0.isOnline }.map(\.id))
        XCTAssertFalse(online.isEmpty, "fixture must contain online deals")

        // Rank as an assigned GSU student vs a user with no real campus context.
        let assigned = DealRanker.rank(deals, interests: [], campus: .georgiaState, radius: 10)
        let noCampus = DealRanker.rank(deals, interests: [], campus: .atlanta, radius: 10)

        // The SET of deals is identical regardless of campus — only order differs.
        XCTAssertEqual(Set(assigned.map(\.id)), Set(deals.map(\.id)))
        XCTAssertEqual(Set(noCampus.map(\.id)), Set(deals.map(\.id)))
        // Every online deal survives in both rankings.
        XCTAssertTrue(online.isSubset(of: Set(assigned.map(\.id))))
        XCTAssertTrue(online.isSubset(of: Set(noCampus.map(\.id))))
    }

    func testClassifierAssignsOnlineAndLocal() {
        let deals = catalog()
        let onlineDeal = deals.first { $0.isOnline }!
        let localDeal = deals.first { !$0.isOnline }!
        XCTAssertEqual(InventoryClassifier.classify(onlineDeal), .online)
        XCTAssertEqual(InventoryClassifier.classify(localDeal), .local)
    }

    func testTrendingDealClassifiesAsTrendingRegardlessOfOnline() {
        let base = catalog().first!
        let trending = base.withTrending(true)
        XCTAssertEqual(InventoryClassifier.classify(trending), .trending)
    }

    func testStudentOnlyOnlineDealClassifiesAsNational() {
        let onlineDeal = catalog().first { $0.isOnline }!
        let national = onlineDeal.withStudentOnly(true)
        XCTAssertEqual(InventoryClassifier.classify(national), .national)
    }
}

private extension Deal {
    func withTrending(_ value: Bool) -> Deal {
        var copy = self
        copy.isTrending = value
        return copy
    }

    func withStudentOnly(_ value: Bool) -> Deal {
        var copy = self
        copy.isStudentOnly = value
        return copy
    }
}
