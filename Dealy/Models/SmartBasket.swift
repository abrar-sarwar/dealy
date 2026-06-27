import Foundation

/// Per-item / per-deal trust signal. Mirrors the backend wire labels exactly.
/// Estimated prices are NEVER presented to the user as verified deals.
enum TrustLabel: String, Codable, Hashable, Sendable, CaseIterable {
    case verified
    case sourceBacked
    case estimated
    case userReported
    case mock

    /// Wire value used by the backend (snake_case).
    var apiValue: String {
        switch self {
        case .verified: return "verified"
        case .sourceBacked: return "source_backed"
        case .estimated: return "estimated"
        case .userReported: return "user_reported"
        case .mock: return "mock"
        }
    }

    /// Decode from the wire value, falling back to the most conservative label
    /// (`estimated`) for anything unknown so we never over-claim trust.
    static func from(apiValue: String?) -> TrustLabel {
        switch apiValue {
        case "verified": return .verified
        case "source_backed": return .sourceBacked
        case "estimated": return .estimated
        case "user_reported": return .userReported
        case "mock": return .mock
        default: return .estimated
        }
    }

    var displayName: String {
        switch self {
        case .verified: return "Verified"
        case .sourceBacked: return "Source-backed"
        case .estimated: return "Estimated"
        case .userReported: return "User-reported"
        case .mock: return "Sample"
        }
    }

    var icon: String {
        switch self {
        case .verified: return "checkmark.seal.fill"
        case .sourceBacked: return "link"
        case .estimated: return "chart.bar.doc.horizontal"
        case .userReported: return "person.fill.checkmark"
        case .mock: return "sparkles"
        }
    }
}

/// Confidence level attached to a basket, item, or matched deal.
enum BasketConfidence: String, Codable, Hashable, Sendable, CaseIterable {
    case low
    case medium
    case high

    var apiValue: String { rawValue }

    static func from(apiValue: String?) -> BasketConfidence {
        switch apiValue {
        case "high": return .high
        case "medium": return .medium
        case "low": return .low
        default: return .low
        }
    }

    var displayName: String {
        switch self {
        case .low: return "Low confidence"
        case .medium: return "Medium confidence"
        case .high: return "High confidence"
        }
    }

    var icon: String {
        switch self {
        case .low: return "gauge.with.dots.needle.0percent"
        case .medium: return "gauge.with.dots.needle.50percent"
        case .high: return "gauge.with.dots.needle.100percent"
        }
    }
}

/// Which role a recommended store plays in the basket route.
enum StoreKind: String, Codable, Hashable, Sendable {
    case bestSingle
    case secondStop

    var apiValue: String { self == .bestSingle ? "best_single" : "second_stop" }

    static func from(apiValue: String?) -> StoreKind {
        switch apiValue {
        case "second_stop": return .secondStop
        default: return .bestSingle
        }
    }

    var displayName: String {
        switch self {
        case .bestSingle: return "Best single stop"
        case .secondStop: return "Worth a second stop"
        }
    }
}

/// A single line item in a generated basket.
struct BasketItem: Identifiable, Codable, Hashable, Sendable {
    /// Stable client-side identity (the wire has no per-item id). Generated once at
    /// mapping time and persisted with saved baskets so it stays consistent.
    let id: String
    let name: String
    let category: String
    let estimatedPrice: Decimal
    let quantity: Int
    let unit: String
    let store: String?
    let matchedDealId: String?
    let confidence: BasketConfidence
    let trustLabel: TrustLabel
    let substitutionOptions: [String]

    init(id: String = UUID().uuidString,
         name: String,
         category: String,
         estimatedPrice: Decimal,
         quantity: Int,
         unit: String,
         store: String?,
         matchedDealId: String?,
         confidence: BasketConfidence,
         trustLabel: TrustLabel,
         substitutionOptions: [String]) {
        self.id = id
        self.name = name
        self.category = category
        self.estimatedPrice = estimatedPrice
        self.quantity = quantity
        self.unit = unit
        self.store = store
        self.matchedDealId = matchedDealId
        self.confidence = confidence
        self.trustLabel = trustLabel
        self.substitutionOptions = substitutionOptions
    }

    /// Title-cased category for section headers.
    var categoryDisplay: String { category.replacingOccurrences(of: "_", with: " ").capitalized }

    /// Line total (price × quantity) for display.
    var lineTotal: Decimal { estimatedPrice * Decimal(quantity) }

    /// Whether a real published deal backs this item's price.
    var hasMatchedDeal: Bool { matchedDealId != nil }
}

/// A store Dealy recommends for the basket, with its route role and economics.
struct StoreRecommendation: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let name: String
    let placeId: String?
    let kind: StoreKind
    let score: Double
    let estimatedTotal: Decimal
    let estimatedSavings: Decimal
    let distanceMiles: Double?
    let reason: String

    init(id: String = UUID().uuidString,
         name: String,
         placeId: String?,
         kind: StoreKind,
         score: Double,
         estimatedTotal: Decimal,
         estimatedSavings: Decimal,
         distanceMiles: Double?,
         reason: String) {
        self.id = id
        self.name = name
        self.placeId = placeId
        self.kind = kind
        self.score = score
        self.estimatedTotal = estimatedTotal
        self.estimatedSavings = estimatedSavings
        self.distanceMiles = distanceMiles
        self.reason = reason
    }
}

/// A real published grocery deal matched into the basket. Distinct from estimated
/// items — these are the only entries that may carry `verified`/`source_backed`.
struct BasketDealMatch: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let merchant: String
    let title: String
    let discount: String
    let price: Decimal
    let validUntil: Date?
    let source: String
    let lastVerifiedAt: Date?
    let confidence: BasketConfidence
    let sourceUrl: String?

    init(id: String = UUID().uuidString,
         merchant: String,
         title: String,
         discount: String,
         price: Decimal,
         validUntil: Date?,
         source: String,
         lastVerifiedAt: Date?,
         confidence: BasketConfidence,
         sourceUrl: String?) {
        self.id = id
        self.merchant = merchant
        self.title = title
        self.discount = discount
        self.price = price
        self.validUntil = validUntil
        self.source = source
        self.lastVerifiedAt = lastVerifiedAt
        self.confidence = confidence
        self.sourceUrl = sourceUrl
    }
}

/// A fully generated Smart Basket. Value type; user state (saved) lives in
/// AppState. `items` is mutable so the generated screen can remove/swap locally
/// before the user saves or accepts the basket.
struct SmartBasket: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let title: String
    let estimatedTotal: Decimal
    let estimatedSavings: Decimal
    let confidence: BasketConfidence
    let sourceStatus: TrustLabel
    let explanation: String
    let routeSummary: String?
    let bestStore: StoreRecommendation?
    let optionalSecondStore: StoreRecommendation?
    var items: [BasketItem]
    let matchedDeals: [BasketDealMatch]
    let substitutions: [String]

    /// Items grouped by category in first-seen order, for the grouped item list.
    var itemsByCategory: [(category: String, items: [BasketItem])] {
        var order: [String] = []
        var grouped: [String: [BasketItem]] = [:]
        for item in items {
            if grouped[item.category] == nil { order.append(item.category) }
            grouped[item.category, default: []].append(item)
        }
        return order.map { (category: $0, items: grouped[$0] ?? []) }
    }

    /// Whether to show the honest low-data banner: an estimated/sample basket or
    /// one with no real matched deals behind it.
    var showsLowDataBanner: Bool {
        sourceStatus == .estimated || sourceStatus == .mock || matchedDeals.isEmpty
    }
}

/// The "Cheap Food Run" intents the lightweight food-run flow can request.
enum FoodRunIntent: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case under10
    case highProtein
    case quickLunch
    case lateNight
    case studySpot
    case dateFriends
    case closestCheap

    var id: String { rawValue }

    var apiValue: String {
        switch self {
        case .under10: return "under_10"
        case .highProtein: return "high_protein"
        case .quickLunch: return "quick_lunch"
        case .lateNight: return "late_night"
        case .studySpot: return "study_spot"
        case .dateFriends: return "date_friends"
        case .closestCheap: return "closest_cheap"
        }
    }

    var displayName: String {
        switch self {
        case .under10: return "Under $10"
        case .highProtein: return "High protein"
        case .quickLunch: return "Quick lunch"
        case .lateNight: return "Late night"
        case .studySpot: return "Study spot"
        case .dateFriends: return "Date / friends"
        case .closestCheap: return "Closest & cheap"
        }
    }

    var icon: String {
        switch self {
        case .under10: return "dollarsign.circle.fill"
        case .highProtein: return "dumbbell.fill"
        case .quickLunch: return "bolt.fill"
        case .lateNight: return "moon.stars.fill"
        case .studySpot: return "book.fill"
        case .dateFriends: return "person.2.fill"
        case .closestCheap: return "location.fill"
        }
    }
}

/// Result of a Cheap Food Run: a single best place plus the reasoning around it.
struct FoodRunResult: Identifiable, Equatable, Sendable {
    let place: Place
    let estimatedCost: Decimal?
    let reason: String
    let matchedDeal: BasketDealMatch?
    let confidence: BasketConfidence
    let sourceStatus: TrustLabel

    var id: String { place.id }
}

/// Request payload for a Cheap Food Run (`POST /v1/feeds/food-run`).
struct FoodRunRequest: Hashable, Sendable {
    var latitude: Double
    var longitude: Double
    var region: String?
    var intent: FoodRunIntent
    var budget: Int?

    /// JSON body matching the wire contract.
    var jsonBody: [String: Any] {
        var body: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "intent": intent.apiValue,
        ]
        if let region { body["region"] = region }
        if let budget { body["budget"] = budget }
        return body
    }
}
