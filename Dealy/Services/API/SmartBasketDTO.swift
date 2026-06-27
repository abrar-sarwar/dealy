import Foundation

/// Wire shape of a recommended store inside a basket response. snake_case keys.
struct StoreRecDTO: Decodable {
    let name: String
    let placeId: String?
    let kind: String?
    let score: Double?
    let estimatedTotal: Double?
    let estimatedSavings: Double?
    let distanceMiles: Double?
    let reason: String?

    private enum CodingKeys: String, CodingKey {
        case name
        case placeId = "place_id"
        case kind
        case score
        case estimatedTotal = "estimated_total"
        case estimatedSavings = "estimated_savings"
        case distanceMiles = "distance_miles"
        case reason
    }

    func toDomain() -> StoreRecommendation {
        StoreRecommendation(
            name: name,
            placeId: placeId,
            kind: StoreKind.from(apiValue: kind),
            score: score ?? 0,
            estimatedTotal: Decimal(estimatedTotal ?? 0),
            estimatedSavings: Decimal(estimatedSavings ?? 0),
            distanceMiles: distanceMiles,
            reason: reason ?? ""
        )
    }
}

/// Wire shape of a single basket line item. snake_case keys.
struct BasketItemDTO: Decodable {
    let name: String
    let category: String?
    let estimatedPrice: Double
    let quantity: Int?
    let unit: String?
    let store: String?
    let matchedDealId: String?
    let confidence: String?
    let trustLabel: String?
    let substitutionOptions: [String]?

    private enum CodingKeys: String, CodingKey {
        case name
        case category
        case estimatedPrice = "estimated_price"
        case quantity
        case unit
        case store
        case matchedDealId = "matched_deal_id"
        case confidence
        case trustLabel = "trust_label"
        case substitutionOptions = "substitution_options"
    }

    func toDomain() -> BasketItem {
        BasketItem(
            name: name,
            category: category ?? "other",
            estimatedPrice: Decimal(estimatedPrice),
            quantity: quantity ?? 1,
            unit: unit ?? "",
            store: store,
            matchedDealId: matchedDealId,
            confidence: BasketConfidence.from(apiValue: confidence),
            trustLabel: TrustLabel.from(apiValue: trustLabel),
            substitutionOptions: substitutionOptions ?? []
        )
    }
}

/// Wire shape of a real matched grocery deal. snake_case keys.
struct MatchedDealDTO: Decodable {
    let merchant: String
    let title: String
    let discount: String?
    let price: Double?
    let validUntil: Date?
    let source: String?
    let lastVerifiedAt: Date?
    let confidence: String?
    let sourceUrl: String?

    private enum CodingKeys: String, CodingKey {
        case merchant
        case title
        case discount
        case price
        case validUntil = "valid_until"
        case source
        case lastVerifiedAt = "last_verified_at"
        case confidence
        case sourceUrl = "source_url"
    }

    func toDomain() -> BasketDealMatch {
        BasketDealMatch(
            merchant: merchant,
            title: title,
            discount: discount ?? "",
            price: Decimal(price ?? 0),
            validUntil: validUntil,
            source: source ?? "",
            lastVerifiedAt: lastVerifiedAt,
            confidence: BasketConfidence.from(apiValue: confidence),
            sourceUrl: sourceUrl
        )
    }
}

/// Wire shape of a generated basket (`BasketDto`). snake_case keys.
struct BasketDTO: Decodable {
    let basketId: String
    let title: String
    let estimatedTotal: Double
    let estimatedSavings: Double
    let confidence: String?
    let sourceStatus: String?
    let explanation: String?
    let routeSummary: String?
    let bestStore: StoreRecDTO?
    let optionalSecondStore: StoreRecDTO?
    let items: [BasketItemDTO]?
    let matchedDeals: [MatchedDealDTO]?
    let substitutions: [String]?

    private enum CodingKeys: String, CodingKey {
        case basketId = "basket_id"
        case title
        case estimatedTotal = "estimated_total"
        case estimatedSavings = "estimated_savings"
        case confidence
        case sourceStatus = "source_status"
        case explanation
        case routeSummary = "route_summary"
        case bestStore = "best_store"
        case optionalSecondStore = "optional_second_store"
        case items
        case matchedDeals = "matched_deals"
        case substitutions
    }

    func toDomain() -> SmartBasket {
        SmartBasket(
            id: basketId,
            title: title,
            estimatedTotal: Decimal(estimatedTotal),
            estimatedSavings: Decimal(estimatedSavings),
            confidence: BasketConfidence.from(apiValue: confidence),
            sourceStatus: TrustLabel.from(apiValue: sourceStatus),
            explanation: explanation ?? "",
            routeSummary: routeSummary,
            bestStore: bestStore?.toDomain(),
            optionalSecondStore: optionalSecondStore?.toDomain(),
            items: (items ?? []).map { $0.toDomain() },
            matchedDeals: (matchedDeals ?? []).map { $0.toDomain() },
            substitutions: substitutions ?? []
        )
    }
}

/// Wire shape of the place inside a food-run response. snake_case keys.
struct FoodRunPlaceDTO: Decodable {
    let id: String
    let name: String
    let category: String?
    let priceBucket: String?
    let rating: Double?
    let latitude: Double?
    let longitude: Double?
    let whyRecommended: String?
    let budgetTip: String?
    let primaryPhotoUrl: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case category
        case priceBucket = "price_bucket"
        case rating
        case latitude
        case longitude
        case whyRecommended = "why_recommended"
        case budgetTip = "budget_tip"
        case primaryPhotoUrl = "primary_photo_url"
    }

    func toPlace() -> Place {
        Place(
            id: id,
            name: name,
            category: DealCategory(rawValue: category ?? "") ?? .food,
            priceBucket: priceBucket,
            rating: rating,
            whyRecommended: whyRecommended,
            bestFor: nil,
            address: nil,
            latitude: latitude,
            longitude: longitude,
            vibeTags: [],
            studentValueScore: nil,
            confidenceLabel: nil,
            budgetTip: budgetTip,
            primaryPhotoUrl: primaryPhotoUrl,
            imageStatus: nil
        )
    }
}

/// Wire shape of a Cheap Food Run response (`FoodRunDto`). snake_case keys.
struct FoodRunDTO: Decodable {
    let place: FoodRunPlaceDTO
    let estimatedCost: Double?
    let reason: String?
    let matchedDeal: MatchedDealDTO?
    let confidence: String?
    let sourceStatus: String?

    private enum CodingKeys: String, CodingKey {
        case place
        case estimatedCost = "estimated_cost"
        case reason
        case matchedDeal = "matched_deal"
        case confidence
        case sourceStatus = "source_status"
    }

    func toDomain() -> FoodRunResult {
        FoodRunResult(
            place: place.toPlace(),
            estimatedCost: estimatedCost.map { Decimal($0) },
            reason: reason ?? "",
            matchedDeal: matchedDeal?.toDomain(),
            confidence: BasketConfidence.from(apiValue: confidence),
            sourceStatus: TrustLabel.from(apiValue: sourceStatus)
        )
    }
}
