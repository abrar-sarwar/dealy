import Foundation

/// A savings offer. Immutable value type — user state (saved/watched) lives
/// centrally in AppState keyed by `id`, never copied into the deal itself.
struct Deal: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let merchant: String
    let category: DealCategory
    let currentPrice: Decimal
    let originalPrice: Decimal
    let distanceMiles: Double
    let expirationDate: Date
    let dealScore: Int            // 0...100, deterministic mock relevance
    let isOnline: Bool
    let shortDescription: String
    let detailedDescription: String
    let terms: String
    let locationTags: [String]
    let couponCode: String?
    let destinationURL: String?
    let latitude: Double?
    let longitude: Double?
    /// Seed used to vary card artwork within a category.
    let visualSeed: Int
    /// When this offer was published, used for accurate recent-first sorting.
    var publishedAt: Date = .distantPast
    /// Server-controlled trust signal: Dealy recently confirmed this deal through
    /// its authoritative source. Never set or trusted from the client.
    var verified: Bool = false

    // MARK: Computed money

    /// Absolute money saved versus original price.
    var savingsAmount: Decimal {
        max(originalPrice - currentPrice, 0)
    }

    /// Percentage off, 0...100. Returns 0 when there is no original price.
    var savingsPercentage: Int {
        guard originalPrice > 0 else { return 0 }
        let fraction = (savingsAmount / originalPrice) as Decimal
        let pct = NSDecimalNumber(decimal: fraction * 100).doubleValue
        return Int(pct.rounded())
    }

    // MARK: Time

    var isExpired: Bool {
        expirationDate <= Date()
    }

    /// True when the deal ends within the next 12 hours.
    func isEndingSoon(reference: Date = Date()) -> Bool {
        let interval = expirationDate.timeIntervalSince(reference)
        return interval > 0 && interval <= 60 * 60 * 12
    }
}

extension Deal {
    /// Display tag for the closest matching location, for card chips.
    var primaryLocationTag: String {
        isOnline ? "Online" : (locationTags.first ?? "Nearby")
    }

    /// True when there's a concrete current/original price to compare.
    /// Some deals (e.g. "extra 20% off", "free with ID") have no fixed price.
    var hasFixedPricing: Bool {
        originalPrice > 0 && currentPrice > 0
    }
}
