import XCTest
@testable import Dealy

final class DealCardMetadataTests: XCTestCase {
    private let reference = Date(timeIntervalSince1970: 1_750_000_000)

    func testLocalDealShowsDistanceCategoryAndExpiry() {
        let deal = makeDeal(isOnline: false, distance: 1.4)

        XCTAssertEqual(
            DealCardMetadata.items(for: deal, reference: reference),
            ["1.4 mi", "Food", "2d left"]
        )
    }

    func testOnlineDealUsesOnlineInsteadOfDistance() {
        let deal = makeDeal(isOnline: true, distance: 0)

        XCTAssertEqual(
            DealCardMetadata.items(for: deal, reference: reference),
            ["Online", "Food", "2d left"]
        )
    }

    private func makeDeal(isOnline: Bool, distance: Double) -> Deal {
        Deal(
            id: "test",
            title: "Test Deal",
            merchant: "Test Merchant",
            category: .food,
            currentPrice: 10,
            originalPrice: 20,
            distanceMiles: distance,
            expirationDate: reference.addingTimeInterval(60 * 60 * 48),
            dealScore: 80,
            isOnline: isOnline,
            shortDescription: "",
            detailedDescription: "",
            terms: "",
            locationTags: [],
            couponCode: nil,
            destinationURL: nil,
            latitude: nil,
            longitude: nil,
            visualSeed: 1
        )
    }
}
