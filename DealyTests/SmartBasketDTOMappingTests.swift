import XCTest
@testable import Dealy

/// Verifies the Smart Basket wire contract (snake_case) decodes and maps to the
/// domain models, including safe fallbacks for unknown enum / trust-label values.
final class SmartBasketDTOMappingTests: XCTestCase {

    private let basketJSON = """
    {
      "basket_id": "11111111-1111-1111-1111-111111111111",
      "title": "$35 High-Protein Grocery Run",
      "estimated_total": 33.80,
      "estimated_savings": 6.40,
      "confidence": "medium",
      "source_status": "estimated",
      "explanation": "Aldi covers 90% of your basket under budget.",
      "route_summary": "1 stop · Aldi · ~1.2 mi",
      "best_store": {
        "name": "Aldi", "place_id": null, "kind": "best_single",
        "score": 0.82, "estimated_total": 33.80, "estimated_savings": 6.40,
        "distance_miles": 1.2, "reason": "Covers 90% of your basket under budget"
      },
      "optional_second_store": null,
      "items": [
        {
          "name": "Eggs (dozen)", "category": "protein", "estimated_price": 2.49,
          "quantity": 1, "unit": "dozen", "store": "Aldi", "matched_deal_id": null,
          "confidence": "medium", "trust_label": "estimated",
          "substitution_options": ["Egg whites"]
        }
      ],
      "matched_deals": [
        {
          "merchant": "Aldi", "title": "Chicken thighs sale", "discount": "30% off",
          "price": 3.49, "valid_until": "2026-07-01T00:00:00.000Z", "source": "crawler:aldi",
          "last_verified_at": "2026-06-26T00:00:00.000Z", "confidence": "high",
          "source_url": "https://www.aldi.us/weekly-specials/"
        }
      ],
      "substitutions": []
    }
    """.data(using: .utf8)!

    func testDecodesBasketAndMapsToDomain() throws {
        let dto = try APIClient.jsonDecoder.decode(BasketDTO.self, from: basketJSON)
        let basket = dto.toDomain()

        XCTAssertEqual(basket.id, "11111111-1111-1111-1111-111111111111")
        XCTAssertEqual(basket.title, "$35 High-Protein Grocery Run")
        XCTAssertEqual(basket.estimatedTotal, Decimal(33.80))
        XCTAssertEqual(basket.estimatedSavings, Decimal(6.40))
        XCTAssertEqual(basket.confidence, .medium)
        XCTAssertEqual(basket.sourceStatus, .estimated)
        XCTAssertEqual(basket.routeSummary, "1 stop · Aldi · ~1.2 mi")

        let store = try XCTUnwrap(basket.bestStore)
        XCTAssertEqual(store.name, "Aldi")
        XCTAssertEqual(store.kind, .bestSingle)
        XCTAssertNil(store.placeId)
        XCTAssertEqual(store.distanceMiles, 1.2)
        XCTAssertNil(basket.optionalSecondStore)

        XCTAssertEqual(basket.items.count, 1)
        let item = basket.items[0]
        XCTAssertEqual(item.name, "Eggs (dozen)")
        XCTAssertEqual(item.category, "protein")
        XCTAssertEqual(item.estimatedPrice, Decimal(2.49))
        XCTAssertEqual(item.unit, "dozen")
        XCTAssertEqual(item.store, "Aldi")
        XCTAssertNil(item.matchedDealId)
        XCTAssertEqual(item.trustLabel, .estimated)
        XCTAssertEqual(item.substitutionOptions, ["Egg whites"])

        XCTAssertEqual(basket.matchedDeals.count, 1)
        let deal = basket.matchedDeals[0]
        XCTAssertEqual(deal.merchant, "Aldi")
        XCTAssertEqual(deal.discount, "30% off")
        XCTAssertEqual(deal.price, Decimal(3.49))
        XCTAssertEqual(deal.confidence, .high)
        XCTAssertNotNil(deal.validUntil)
        XCTAssertNotNil(deal.lastVerifiedAt)
        XCTAssertEqual(deal.sourceUrl, "https://www.aldi.us/weekly-specials/")
    }

    func testUnknownTrustLabelAndConfidenceFallBackSafely() throws {
        let json = """
        {
          "basket_id": "x", "title": "t", "estimated_total": 10, "estimated_savings": 0,
          "confidence": "ultra", "source_status": "magic", "explanation": "",
          "items": [
            { "name": "Rice", "category": "grains", "estimated_price": 1.99,
              "quantity": 1, "unit": "bag", "store": null, "matched_deal_id": null,
              "confidence": "nope", "trust_label": "wat", "substitution_options": [] }
          ],
          "matched_deals": []
        }
        """.data(using: .utf8)!
        let basket = try APIClient.jsonDecoder.decode(BasketDTO.self, from: json).toDomain()
        // Unknown confidence -> low; unknown trust label -> estimated (conservative).
        XCTAssertEqual(basket.confidence, .low)
        XCTAssertEqual(basket.sourceStatus, .estimated)
        XCTAssertEqual(basket.items[0].confidence, .low)
        XCTAssertEqual(basket.items[0].trustLabel, .estimated)
        XCTAssertTrue(basket.showsLowDataBanner)
    }

    func testSecondStoreKindFallsBackToBestSingleForUnknownKind() throws {
        let json = """
        {
          "basket_id": "x", "title": "t", "estimated_total": 10, "estimated_savings": 0,
          "confidence": "high", "source_status": "verified", "explanation": "",
          "best_store": { "name": "Publix", "kind": "weird", "score": 0.5,
            "estimated_total": 10, "estimated_savings": 1, "reason": "ok" },
          "items": [], "matched_deals": []
        }
        """.data(using: .utf8)!
        let basket = try APIClient.jsonDecoder.decode(BasketDTO.self, from: json).toDomain()
        XCTAssertEqual(basket.bestStore?.kind, .bestSingle)
    }

    func testFoodRunDecodesAndMapsToDomain() throws {
        let json = """
        {
          "place": {
            "id": "p1", "name": "Baraka Shawarma", "category": "food",
            "price_bucket": "$", "rating": 4.6, "latitude": 33.75, "longitude": -84.39,
            "why_recommended": "Cheap and filling", "budget_tip": "Get the chicken plate",
            "primary_photo_url": null
          },
          "estimated_cost": 9.50,
          "reason": "Best under-$10 pick near you",
          "matched_deal": null,
          "confidence": "high",
          "source_status": "source_backed"
        }
        """.data(using: .utf8)!
        let result = try APIClient.jsonDecoder.decode(FoodRunDTO.self, from: json).toDomain()
        XCTAssertEqual(result.place.name, "Baraka Shawarma")
        XCTAssertEqual(result.place.category, .food)
        XCTAssertEqual(result.place.budgetTip, "Get the chicken plate")
        XCTAssertEqual(result.estimatedCost, Decimal(9.50))
        XCTAssertEqual(result.confidence, .high)
        XCTAssertEqual(result.sourceStatus, .sourceBacked)
        XCTAssertNil(result.matchedDeal)
    }
}
