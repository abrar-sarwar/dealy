import XCTest
@testable import Dealy

/// Tests for `DealImageDedup.nullingSharedImages` — generic shared page heros
/// are nulled to `nil` so each deal falls back to category artwork, while
/// unique images are preserved and order is kept.
final class DealImageDedupTests: XCTestCase {

    private func makeDeal(id: String, imageURL: String?) -> Deal {
        Deal(
            id: id, title: "Deal \(id)", merchant: "M", category: .entertainment,
            currentPrice: 5, originalPrice: 10, distanceMiles: 0.5,
            expirationDate: .distantFuture, dealScore: 50, isOnline: false,
            shortDescription: "s", detailedDescription: "d", terms: "t",
            locationTags: [], couponCode: nil, destinationURL: nil,
            latitude: nil, longitude: nil, visualSeed: 0, imageURL: imageURL
        )
    }

    func testSharedImageAcrossFourDealsIsNulled() {
        let shared = "https://engagement.gsu.edu/files/2021/06/Cinefest_employee.jpg"
        let deals = [
            makeDeal(id: "ballet", imageURL: shared),
            makeDeal(id: "symphony", imageURL: shared),
            makeDeal(id: "alliance", imageURL: shared),
            makeDeal(id: "fourth", imageURL: shared)
        ]
        let result = DealImageDedup.nullingSharedImages(deals)
        XCTAssertEqual(result.count, 4)
        XCTAssertTrue(result.allSatisfy { $0.imageURL == nil })
    }

    func testUniqueImagesAreKept() {
        let deals = [
            makeDeal(id: "a", imageURL: "https://x.com/a.jpg"),
            makeDeal(id: "b", imageURL: "https://x.com/b.jpg"),
            makeDeal(id: "c", imageURL: "https://x.com/c.jpg")
        ]
        let result = DealImageDedup.nullingSharedImages(deals)
        XCTAssertEqual(result.map(\.imageURL),
                       ["https://x.com/a.jpg", "https://x.com/b.jpg", "https://x.com/c.jpg"])
    }

    func testNilImageDealsUntouched() {
        let deals = [
            makeDeal(id: "a", imageURL: nil),
            makeDeal(id: "b", imageURL: nil)
        ]
        let result = DealImageDedup.nullingSharedImages(deals)
        XCTAssertTrue(result.allSatisfy { $0.imageURL == nil })
        XCTAssertEqual(result.map(\.id), ["a", "b"])
    }

    func testMixedSharedAndUniquePreservesOrderAndUnique() {
        let shared = "https://x.com/generic.jpg"
        let deals = [
            makeDeal(id: "1", imageURL: shared),         // shared -> nil
            makeDeal(id: "2", imageURL: "https://x.com/unique.jpg"), // kept
            makeDeal(id: "3", imageURL: shared),         // shared -> nil
            makeDeal(id: "4", imageURL: nil)             // untouched
        ]
        let result = DealImageDedup.nullingSharedImages(deals)
        XCTAssertEqual(result.map(\.id), ["1", "2", "3", "4"])
        XCTAssertNil(result[0].imageURL)
        XCTAssertEqual(result[1].imageURL, "https://x.com/unique.jpg")
        XCTAssertNil(result[2].imageURL)
        XCTAssertNil(result[3].imageURL)
    }
}
