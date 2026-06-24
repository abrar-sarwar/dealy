import XCTest
@testable import Dealy

/// Tests for DealImage.resolvedSource(for:) logic and DealDTO → Deal.imageURL mapping.
final class DealImageTests: XCTestCase {

    // MARK: - Helpers

    private func makeDeal(imageURL: String?) -> Deal {
        Deal(
            id: "test-id",
            title: "Test Deal",
            merchant: "Test Merchant",
            category: .food,
            currentPrice: 5,
            originalPrice: 10,
            distanceMiles: 0.5,
            expirationDate: .distantFuture,
            dealScore: 50,
            isOnline: false,
            shortDescription: "Short",
            detailedDescription: "Detailed",
            terms: "Terms",
            locationTags: [],
            couponCode: nil,
            destinationURL: nil,
            latitude: nil,
            longitude: nil,
            visualSeed: 0,
            imageURL: imageURL
        )
    }

    // MARK: - resolvedSource tests

    func testResolvesRemoteForValidHttpsURL() {
        let deal = makeDeal(imageURL: "https://x.com/a.jpg")
        let source = DealImage.resolvedSource(for: deal)
        if case .remote(let url) = source {
            XCTAssertEqual(url.absoluteString, "https://x.com/a.jpg")
        } else {
            XCTFail("Expected .remote, got \(source)")
        }
    }

    func testFallbackForNilImageURL() {
        let deal = makeDeal(imageURL: nil)
        XCTAssertEqual(DealImage.resolvedSource(for: deal), .fallback)
    }

    func testFallbackForEmptyStringImageURL() {
        let deal = makeDeal(imageURL: "")
        XCTAssertEqual(DealImage.resolvedSource(for: deal), .fallback)
    }

    func testFallbackForHttpURL() {
        // Non-https URLs are not trusted.
        let deal = makeDeal(imageURL: "http://x.com/a.jpg")
        XCTAssertEqual(DealImage.resolvedSource(for: deal), .fallback)
    }

    func testFallbackForGarbageNonURLString() {
        let deal = makeDeal(imageURL: "not a url at all!!!")
        // URL(string:) may or may not parse garbage; either way scheme won't be "https"
        XCTAssertEqual(DealImage.resolvedSource(for: deal), .fallback)
    }

    // MARK: - DTO mapping tests

    func testDTOImageUrlMapsToDealimagURL() throws {
        let json = #"""
        {"items":[{
          "id":"img-1","title":"t","merchant":"m","category":"food",
          "currentPrice":1,"originalPrice":2,"currency":"USD","dealScore":50,
          "isOnline":false,"isStudentOnly":false,
          "shortDescription":"s","detailedDescription":"d","terms":"",
          "couponCode":null,"destinationUrl":null,"latitude":null,"longitude":null,
          "locationTags":[],"visualSeed":0,
          "publishedAt":"2026-06-18T12:00:00Z","startAt":null,
          "expiresAt":"2099-06-20T00:00:00Z",
          "imageUrl":"https://example.com/og.jpg"
        }],"nextCursor":null}
        """#.data(using: .utf8)!

        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json)
        let deal = page.items[0].toDeal()
        XCTAssertEqual(deal.imageURL, "https://example.com/og.jpg")
    }

    func testDTONilImageUrlMapsToNil() throws {
        let json = #"""
        {"items":[{
          "id":"img-2","title":"t","merchant":"m","category":"food",
          "currentPrice":1,"originalPrice":2,"currency":"USD","dealScore":50,
          "isOnline":false,"isStudentOnly":false,
          "shortDescription":"s","detailedDescription":"d","terms":"",
          "couponCode":null,"destinationUrl":null,"latitude":null,"longitude":null,
          "locationTags":[],"visualSeed":0,
          "publishedAt":"2026-06-18T12:00:00Z","startAt":null,
          "expiresAt":"2099-06-20T00:00:00Z",
          "imageUrl":null
        }],"nextCursor":null}
        """#.data(using: .utf8)!

        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json)
        XCTAssertNil(page.items[0].toDeal().imageURL)
    }

    func testDTOAbsentImageUrlFieldMapsToNil() throws {
        // imageUrl key entirely absent — older payloads without the field.
        let json = #"""
        {"items":[{
          "id":"img-3","title":"t","merchant":"m","category":"food",
          "currentPrice":1,"originalPrice":2,"currency":"USD","dealScore":50,
          "isOnline":false,"isStudentOnly":false,
          "shortDescription":"s","detailedDescription":"d","terms":"",
          "couponCode":null,"destinationUrl":null,"latitude":null,"longitude":null,
          "locationTags":[],"visualSeed":0,
          "publishedAt":"2026-06-18T12:00:00Z","startAt":null,
          "expiresAt":"2099-06-20T00:00:00Z"
        }],"nextCursor":null}
        """#.data(using: .utf8)!

        let page = try APIClient.jsonDecoder.decode(DealPageDTO.self, from: json)
        XCTAssertNil(page.items[0].toDeal().imageURL)
    }
}
