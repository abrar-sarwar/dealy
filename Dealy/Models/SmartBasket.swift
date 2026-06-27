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

/// The Food Run "goals" — "Where should I eat right now?" Mirrors the backend
/// `goal` wire values exactly. `custom` is the open-ended catch-all.
enum FoodRunIntent: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case under10
    case cheapest
    case highProtein
    case quickLunch
    case lateNight
    case studySpot
    case coffeeDessert
    case dateFriends
    case groupMeal
    case bestValue
    case pickupDeal
    case studentFriendly
    case custom

    var id: String { rawValue }

    var apiValue: String {
        switch self {
        case .under10: return "under_10"
        case .cheapest: return "cheapest"
        case .highProtein: return "high_protein"
        case .quickLunch: return "quick_lunch"
        case .lateNight: return "late_night"
        case .studySpot: return "study_spot"
        case .coffeeDessert: return "coffee_dessert"
        case .dateFriends: return "date_friends"
        case .groupMeal: return "group_meal"
        case .bestValue: return "best_value"
        case .pickupDeal: return "pickup_deal"
        case .studentFriendly: return "student_friendly"
        case .custom: return "custom"
        }
    }

    /// Decode from the wire `goal` value, falling back to `.bestValue` for
    /// anything unknown so a new backend goal never breaks the client.
    static func from(apiValue: String?) -> FoodRunIntent {
        FoodRunIntent.allCases.first { $0.apiValue == apiValue } ?? .bestValue
    }

    var displayName: String {
        switch self {
        case .under10: return "Under $10"
        case .cheapest: return "Cheapest"
        case .highProtein: return "High protein"
        case .quickLunch: return "Quick lunch"
        case .lateNight: return "Late night"
        case .studySpot: return "Study spot"
        case .coffeeDessert: return "Coffee / dessert"
        case .dateFriends: return "Date / friends"
        case .groupMeal: return "Group meal"
        case .bestValue: return "Best value"
        case .pickupDeal: return "Pickup deal"
        case .studentFriendly: return "Student-friendly"
        case .custom: return "Surprise me"
        }
    }

    var icon: String {
        switch self {
        case .under10: return "dollarsign.circle.fill"
        case .cheapest: return "tag.fill"
        case .highProtein: return "dumbbell.fill"
        case .quickLunch: return "bolt.fill"
        case .lateNight: return "moon.stars.fill"
        case .studySpot: return "book.fill"
        case .coffeeDessert: return "cup.and.saucer.fill"
        case .dateFriends: return "person.2.fill"
        case .groupMeal: return "person.3.fill"
        case .bestValue: return "star.circle.fill"
        case .pickupDeal: return "bag.fill"
        case .studentFriendly: return "graduationcap.fill"
        case .custom: return "sparkles"
        }
    }
}

/// When the food run is happening — shapes the (honest, estimated) open-now
/// heuristic and ranking. Mirrors the backend `timeOfDay` wire values.
enum FoodRunTimeOfDay: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case morning
    case lunch
    case afternoon
    case dinner
    case lateNight

    var id: String { rawValue }

    var apiValue: String {
        switch self {
        case .morning: return "morning"
        case .lunch: return "lunch"
        case .afternoon: return "afternoon"
        case .dinner: return "dinner"
        case .lateNight: return "late_night"
        }
    }

    var displayName: String {
        switch self {
        case .morning: return "Morning"
        case .lunch: return "Lunch"
        case .afternoon: return "Afternoon"
        case .dinner: return "Dinner"
        case .lateNight: return "Late night"
        }
    }

    var icon: String {
        switch self {
        case .morning: return "sunrise.fill"
        case .lunch: return "sun.max.fill"
        case .afternoon: return "cloud.sun.fill"
        case .dinner: return "sunset.fill"
        case .lateNight: return "moon.stars.fill"
        }
    }
}

/// The mood of the meal. Mirrors the backend `vibe` wire values.
enum FoodRunVibe: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case quick
    case filling
    case healthy
    case comfort
    case social
    case quiet

    var id: String { rawValue }

    var apiValue: String { rawValue }

    var displayName: String {
        switch self {
        case .quick: return "Quick"
        case .filling: return "Filling"
        case .healthy: return "Healthy"
        case .comfort: return "Comfort"
        case .social: return "Social"
        case .quiet: return "Quiet"
        }
    }

    var icon: String {
        switch self {
        case .quick: return "bolt.fill"
        case .filling: return "fork.knife"
        case .healthy: return "leaf.fill"
        case .comfort: return "heart.fill"
        case .social: return "person.2.fill"
        case .quiet: return "book.fill"
        }
    }
}

/// Result of a Food Run: a single best place, the reasoning around it, and a
/// ranked list of nearby alternatives.
struct FoodRunResult: Identifiable, Equatable, Hashable, Sendable {
    let place: Place
    /// More options nearby, ranked best-first.
    let alternatives: [Place]
    let estimatedCost: Decimal?
    let reason: String
    /// "Best under $10", "Worth the walk", … — the headline label for the pick.
    let rankingLabel: String?
    /// "Get the falafel wrap" — what to order to stay on budget. nil when unknown.
    let recommendedOrder: String?
    /// Display tags ("under $10", "good for students", …) derived server-side.
    let tags: [String]
    let matchedDeal: BasketDealMatch?
    let confidence: BasketConfidence
    let sourceStatus: TrustLabel

    var id: String { place.id }
}

/// Request payload for a Food Run (`POST /v1/feeds/food-run`).
struct FoodRunRequest: Hashable, Sendable {
    var latitude: Double
    var longitude: Double
    var region: String?
    var goal: FoodRunIntent
    var budget: Int?
    var maxDistanceMiles: Double?
    var dietary: [DietaryPreference]
    var timeOfDay: FoodRunTimeOfDay?
    var vibe: FoodRunVibe?
    var allowChains: Bool
    var allowLocal: Bool

    init(latitude: Double,
         longitude: Double,
         region: String? = nil,
         goal: FoodRunIntent,
         budget: Int? = nil,
         maxDistanceMiles: Double? = nil,
         dietary: [DietaryPreference] = [],
         timeOfDay: FoodRunTimeOfDay? = nil,
         vibe: FoodRunVibe? = nil,
         allowChains: Bool = true,
         allowLocal: Bool = true) {
        self.latitude = latitude
        self.longitude = longitude
        self.region = region
        self.goal = goal
        self.budget = budget
        self.maxDistanceMiles = maxDistanceMiles
        self.dietary = dietary
        self.timeOfDay = timeOfDay
        self.vibe = vibe
        self.allowChains = allowChains
        self.allowLocal = allowLocal
    }

    /// JSON body matching the v2 wire contract. snake_case for the value-bearing
    /// fields, camelCase for the flags (mirrors `BasketRequest.jsonBody`).
    var jsonBody: [String: Any] {
        var body: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "goal": goal.apiValue,
            "allowChains": allowChains,
            "allowLocal": allowLocal,
        ]
        if let region { body["region"] = region }
        if let budget { body["budget"] = budget }
        if let maxDistanceMiles { body["maxDistanceMiles"] = maxDistanceMiles }
        if !dietary.isEmpty { body["dietary"] = dietary.map { $0.apiValue } }
        if let timeOfDay { body["timeOfDay"] = timeOfDay.apiValue }
        if let vibe { body["vibe"] = vibe.apiValue }
        return body
    }
}
