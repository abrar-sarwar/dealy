import XCTest
@testable import Dealy

/// Pure model/value tests — money math and time helpers.
final class DealModelTests: XCTestCase {

    private func makeDeal(id: String = "t",
                          category: DealCategory = .food,
                          current: Decimal = 5.99,
                          original: Decimal = 11.99,
                          distance: Double = 0.4,
                          expiresInHours: Double = 2,
                          score: Int = 90,
                          online: Bool = false,
                          tags: [String] = ["Atlanta"],
                          reference: Date) -> Deal {
        Deal(id: id, title: "Test", merchant: "M", category: category,
             currentPrice: current, originalPrice: original, distanceMiles: distance,
             expirationDate: reference.addingTimeInterval(expiresInHours * 3600),
             dealScore: score, isOnline: online, shortDescription: "s",
             detailedDescription: "d", terms: "t", locationTags: tags,
             couponCode: nil, destinationURL: nil, latitude: nil, longitude: nil, visualSeed: 0)
    }

    func testSavingsAmount() {
        let deal = makeDeal(reference: Date())
        XCTAssertEqual(NSDecimalNumber(decimal: deal.savingsAmount).doubleValue, 6.0, accuracy: 0.005)
    }

    func testSavingsPercentageRounds() {
        let deal = makeDeal(current: 5.99, original: 11.99, reference: Date())
        XCTAssertEqual(deal.savingsPercentage, 50)
    }

    func testSavingsPercentageZeroWhenNoOriginal() {
        let deal = makeDeal(current: 0, original: 0, reference: Date())
        XCTAssertEqual(deal.savingsPercentage, 0)
        XCTAssertEqual(deal.savingsAmount, 0)
        XCTAssertFalse(deal.hasFixedPricing)
    }

    func testSavingsNeverNegative() {
        let deal = makeDeal(current: 20, original: 10, reference: Date())
        XCTAssertEqual(deal.savingsAmount, 0)
    }

    func testEndingSoonWithinTwelveHours() {
        let now = Date()
        let soon = makeDeal(expiresInHours: 2, reference: now)
        let later = makeDeal(expiresInHours: 48, reference: now)
        XCTAssertTrue(soon.isEndingSoon(reference: now))
        XCTAssertFalse(later.isEndingSoon(reference: now))
    }

    func testExpiredDetection() {
        let now = Date()
        let expired = makeDeal(expiresInHours: -1, reference: now)
        XCTAssertTrue(expired.isExpired)
    }

    func testIsExpiredFalseForFutureExpiry() {
        let now = Date()
        let active = makeDeal(expiresInHours: 48, reference: now)
        XCTAssertFalse(active.isExpired)
    }

    func testIsRedeemableFalseWhenExpired() {
        let now = Date()
        let expired = makeDeal(expiresInHours: -1, reference: now)
        XCTAssertTrue(expired.isExpired)
        XCTAssertFalse(expired.isRedeemable,
                       "an expired deal must not be redeemable")
    }

    func testIsRedeemableTrueWhenNotExpired() {
        let now = Date()
        let active = makeDeal(expiresInHours: 24, reference: now)
        XCTAssertFalse(active.isExpired)
        XCTAssertTrue(active.isRedeemable,
                      "an active deal must be redeemable")
    }

    func testMockDatasetHasEnoughDeals() {
        XCTAssertGreaterThanOrEqual(MockDeals.dataset(reference: Date()).count, 36)
    }

    func testMockDatasetIDsUnique() {
        let deals = MockDeals.dataset(reference: Date())
        XCTAssertEqual(Set(deals.map(\.id)).count, deals.count)
    }
}
