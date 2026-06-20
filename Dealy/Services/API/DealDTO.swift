import Foundation

/// Wire shape of the nearby-feed response.
struct DealPageDTO: Decodable {
    let items: [DealDTO]
    let nextCursor: String?
}

/// Codable DTO for a deal from the API. Kept separate from the domain `Deal`
/// so the network contract can evolve independently of the app model.
struct DealDTO: Decodable {
    let id: String
    let title: String
    let merchant: String
    let category: String
    let currentPrice: Double
    let originalPrice: Double
    let currency: String
    let distanceMiles: Double?
    let dealScore: Int
    /// Server-controlled trust signal; absent on older payloads → treated as false.
    let verified: Bool?
    let isOnline: Bool
    let isStudentOnly: Bool
    let shortDescription: String
    let detailedDescription: String
    let terms: String
    let couponCode: String?
    let destinationUrl: String?
    let latitude: Double?
    let longitude: Double?
    let locationTags: [String]
    let visualSeed: Int
    let publishedAt: Date
    let startAt: Date?
    let expiresAt: Date

    /// Map to the app's domain model. Unknown category slugs fall back to `.food`.
    func toDeal() -> Deal {
        Deal(
            id: id,
            title: title,
            merchant: merchant,
            category: DealCategory(rawValue: category) ?? .food,
            currentPrice: Decimal(currentPrice),
            originalPrice: Decimal(originalPrice),
            distanceMiles: distanceMiles ?? 0,
            expirationDate: expiresAt,
            dealScore: dealScore,
            isOnline: isOnline,
            shortDescription: shortDescription,
            detailedDescription: detailedDescription,
            terms: terms,
            locationTags: locationTags,
            couponCode: couponCode,
            destinationURL: destinationUrl,
            latitude: latitude,
            longitude: longitude,
            visualSeed: visualSeed,
            publishedAt: publishedAt,
            verified: verified ?? false
        )
    }
}
