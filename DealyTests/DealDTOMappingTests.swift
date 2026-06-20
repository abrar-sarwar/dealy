import XCTest
@testable import Dealy

/// Verifies the API JSON contract decodes and maps to the domain `Deal`,
/// including ISO-8601 fractional-second dates and money as `Decimal`.
final class DealDTOMappingTests: XCTestCase {
    private let sampleJSON = """
    {
      "items": [
        {
          "id": "11111111-1111-1111-1111-111111111111",
          "title": "BOGO Pizza Slices",
          "merchant": "Rosa's Pizza",
          "category": "food",
          "currentPrice": 5.99,
          "originalPrice": 11.99,
          "currency": "USD",
          "savingsAmount": 6.0,
          "savingsPercentage": 50,
          "distanceMiles": 0.4,
          "dealScore": 94,
          "isOnline": false,
          "isStudentOnly": true,
          "shortDescription": "BOGO near Georgia State.",
          "detailedDescription": "Buy one get one.",
          "terms": "Valid with student ID.",
          "couponCode": "SAVE1",
          "destinationUrl": null,
          "latitude": 33.7531,
          "longitude": -84.3857,
          "locationTags": ["atlanta", "downtown"],
          "visualSeed": 3,
          "publishedAt": "2026-06-18T12:00:00.000Z",
          "startAt": null,
          "expiresAt": "2026-06-20T00:00:00.000Z"
        }
      ],
      "nextCursor": "Y3Vyc29y"
    }
    """.data(using: .utf8)!

    func testDecodesPageAndMapsToDomainDeal() throws {
        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: sampleJSON)
        XCTAssertEqual(page.items.count, 1)
        XCTAssertEqual(page.nextCursor, "Y3Vyc29y")

        let deal = page.items[0].toDeal()
        XCTAssertEqual(deal.id, "11111111-1111-1111-1111-111111111111")
        XCTAssertEqual(deal.title, "BOGO Pizza Slices")
        XCTAssertEqual(deal.category, .food)
        XCTAssertEqual(deal.currentPrice, Decimal(5.99))
        XCTAssertEqual(deal.originalPrice, Decimal(11.99))
        XCTAssertEqual(deal.dealScore, 94)
        XCTAssertFalse(deal.isOnline)
        XCTAssertEqual(deal.distanceMiles, 0.4, accuracy: 0.0001)
        XCTAssertEqual(deal.couponCode, "SAVE1")
        XCTAssertNil(deal.destinationURL)
        XCTAssertEqual(deal.locationTags, ["atlanta", "downtown"])
        XCTAssertEqual(deal.visualSeed, 3)
        XCTAssertEqual(deal.publishedAt, Date(timeIntervalSince1970: 1_781_784_000))
    }

    func testUnknownCategoryFallsBack() throws {
        let json = sampleJSON
        var page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json)
        XCTAssertEqual(page.items.first?.category, "food")
        // Map a synthetic unknown-category DTO via JSON to confirm the fallback.
        let unknown = #"{"items":[{"id":"x","title":"t","merchant":"m","category":"nope","currentPrice":1,"originalPrice":2,"currency":"USD","dealScore":50,"isOnline":true,"isStudentOnly":false,"shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":null,"latitude":null,"longitude":null,"locationTags":[],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2026-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: unknown)
        XCTAssertEqual(page.items[0].toDeal().category, .food)
        XCTAssertTrue(page.items[0].toDeal().isOnline)
    }

    func testVerifiedMapsThroughAndDefaultsFalseWhenAbsent() throws {
        // Absent in the sample payload → server-controlled flag defaults to false.
        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: sampleJSON)
        XCTAssertFalse(page.items[0].toDeal().verified)

        let verifiedJSON = #"{"items":[{"id":"v","title":"t","merchant":"m","category":"food","currentPrice":1,"originalPrice":2,"currency":"USD","dealScore":50,"verified":true,"isOnline":false,"isStudentOnly":false,"shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":null,"latitude":null,"longitude":null,"locationTags":[],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        let verified = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: verifiedJSON)
        XCTAssertTrue(verified.items[0].toDeal().verified)
    }
}
