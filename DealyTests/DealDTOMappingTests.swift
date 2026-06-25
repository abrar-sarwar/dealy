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

    // MARK: - locationPrecision mapping

    func testLocationPrecisionExactMapsThroughAndFlagsNotApproximate() throws {
        let json = #"{"items":[{"id":"e1","title":"t","merchant":"m","category":"food","currentPrice":1,"originalPrice":2,"currency":"USD","dealScore":50,"isOnline":false,"isStudentOnly":false,"shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":null,"latitude":33.7,"longitude":-84.4,"locationTags":["midtown"],"locationPrecision":"exact","visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json)
        let deal = page.items[0].toDeal()
        XCTAssertEqual(deal.locationPrecision, "exact")
        XCTAssertFalse(deal.isApproximateLocation)
    }

    func testLocationPrecisionAbsentDefaultsToApproximate() throws {
        // The sampleJSON has no locationPrecision field → should default to "approximate"
        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: sampleJSON)
        let deal = page.items[0].toDeal()
        XCTAssertEqual(deal.locationPrecision, "approximate")
        XCTAssertTrue(deal.isApproximateLocation)
    }

    func testLocationPrecisionNilInDTODefaultsToApproximate() throws {
        let json = #"{"items":[{"id":"a1","title":"t","merchant":"m","category":"food","currentPrice":1,"originalPrice":2,"currency":"USD","dealScore":50,"isOnline":false,"isStudentOnly":false,"shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":null,"latitude":33.7,"longitude":-84.4,"locationTags":[],"locationPrecision":null,"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json)
        let deal = page.items[0].toDeal()
        XCTAssertEqual(deal.locationPrecision, "approximate")
        XCTAssertTrue(deal.isApproximateLocation)
    }

    func testDecodesRedemptionBrandWhenPresentAndAbsent() throws {
        let withBrand = #"{"items":[{"id":"s1","title":"Apple Education","merchant":"Apple","category":"tech","currentPrice":0,"originalPrice":0,"currency":"USD","dealScore":80,"isOnline":true,"isStudentOnly":true,"redemptionBrand":"Apple Store","shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":"https://www.apple.com/us-edu/store","latitude":null,"longitude":null,"locationTags":["online","nationwide"],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: withBrand)
        XCTAssertEqual(page.items[0].toDeal().redemptionBrand, "Apple Store")

        let withoutBrand = #"{"items":[{"id":"s2","title":"Spotify","merchant":"Spotify","category":"entertainment","currentPrice":0,"originalPrice":0,"currency":"USD","dealScore":80,"isOnline":true,"isStudentOnly":true,"shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":"https://www.spotify.com/us/student/","latitude":null,"longitude":null,"locationTags":["online","nationwide"],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        let page2 = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: withoutBrand)
        XCTAssertNil(page2.items[0].toDeal().redemptionBrand)
    }

    // MARK: - campus / student-discount mapping + badges

    func testCampusAndStudentIdMapThroughAndDriveBadges() throws {
        let json = #"{"items":[{"id":"cs","title":"Panther Dining Special","merchant":"GSU Dining","category":"food","currentPrice":0,"originalPrice":0,"currency":"USD","dealScore":60,"isOnline":false,"isStudentOnly":false,"campusSlug":"gsu","requiresStudentId":true,"shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":null,"latitude":33.75,"longitude":-84.38,"locationTags":["gsu"],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        let deal = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json).items[0].toDeal()
        XCTAssertEqual(deal.campusSlug, "gsu")
        XCTAssertTrue(deal.requiresStudentId)
        XCTAssertEqual(deal.campusBadge, "GSU") // uppercased campus chip label
    }

    func testNonCampusDealHasNoCampusOrStudentBadge() throws {
        // sampleJSON (a normal Rosa's Pizza deal) has neither field present.
        let deal = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: sampleJSON).items[0].toDeal()
        XCTAssertNil(deal.campusSlug)
        XCTAssertNil(deal.campusBadge)
        XCTAssertFalse(deal.requiresStudentId)
    }

    // MARK: - audience / campusDealType / eligibilityBadge mapping

    /// DTO with audience:"campus_community", campusDealType:"campus_perk", requiresStudentId:false,
    /// campusSlug:"gt" → eligibilityBadge == .campusPerk, campusBadge == "GT", requiresStudentId == false.
    func testCampusCommunityPerkMapsToCorrectBadge() throws {
        let json = #"{"items":[{"id":"cp1","title":"Perk Deal","merchant":"GT Store","category":"food","currentPrice":0,"originalPrice":0,"currency":"USD","dealScore":70,"isOnline":false,"isStudentOnly":false,"campusSlug":"gt","requiresStudentId":false,"audience":"campus_community","campusDealType":"campus_perk","shortDescription":"s","detailedDescription":"d","terms":"","couponCode":null,"destinationUrl":null,"latitude":33.77,"longitude":-84.39,"locationTags":["gt"],"visualSeed":0,"publishedAt":"2026-06-18T12:00:00Z","startAt":null,"expiresAt":"2099-06-20T00:00:00Z"}],"nextCursor":null}"#.data(using: .utf8)!
        let deal = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json).items[0].toDeal()
        XCTAssertEqual(deal.audience, "campus_community")
        XCTAssertEqual(deal.campusDealType, "campus_perk")
        XCTAssertFalse(deal.requiresStudentId)
        XCTAssertEqual(deal.campusBadge, "GT")
        XCTAssertEqual(deal.eligibilityBadge, .campusPerk)
        // Must NOT surface studentID badge when requiresStudentId is false.
        XCTAssertNotEqual(deal.eligibilityBadge, .studentID)
    }

    /// A deal with no audience/campus fields in JSON → audience == "general",
    /// eligibilityBadge == nil, campusBadge == nil.
    func testNormalDealDefaultsToGeneralAudienceAndNilBadge() throws {
        // sampleJSON (Rosa's Pizza) has no audience/campusDealType/campusSlug fields.
        let deal = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: sampleJSON).items[0].toDeal()
        XCTAssertEqual(deal.audience, "general")
        XCTAssertNil(deal.campusDealType)
        XCTAssertNil(deal.eligibilityBadge)
        XCTAssertNil(deal.campusBadge)
    }
}
