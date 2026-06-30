import Foundation

/// In-memory mock for the Smart Basket feature. Deterministic; used for previews,
/// the offline/mock app build, and tests. Always returns a clearly-labeled
/// ESTIMATED basket (built from student staples) so the whole flow works offline
/// and before real grocery data exists — never presenting estimates as verified.
final class MockSmartBasketService: SmartBasketServicing {
    var simulateFailureOnce: Bool

    /// Remembers generated baskets by id so `regenerate`/`basket(id:)` resolve.
    private var generated: [String: (request: BasketRequest, basket: SmartBasket)] = [:]

    init(simulateFailureOnce: Bool = false) {
        self.simulateFailureOnce = simulateFailureOnce
    }

    func generate(_ request: BasketRequest) async throws -> SmartBasket {
        if simulateFailureOnce {
            simulateFailureOnce = false
            throw SmartBasketError.unavailable
        }
        let basket = Self.makeBasket(for: request, id: UUID().uuidString)
        generated[basket.id] = (request, basket)
        return basket
    }

    func regenerate(id: String) async throws -> SmartBasket {
        let request = generated[id]?.request ?? Self.defaultRequest
        // Re-roll: keep the same id, vary nothing material in the mock.
        let basket = Self.makeBasket(for: request, id: id)
        generated[id] = (request, basket)
        return basket
    }

    func basket(id: String) async throws -> SmartBasket {
        if let existing = generated[id]?.basket { return existing }
        let basket = Self.makeBasket(for: Self.defaultRequest, id: id)
        return basket
    }

    func foodRun(_ request: FoodRunRequest) async throws -> FoodRunResult {
        if simulateFailureOnce {
            simulateFailureOnce = false
            throw SmartBasketError.unavailable
        }
        let tags = ["under $10", "good for students", "high protein"]
        let place = Place(
            id: "food-run-\(request.goal.rawValue)",
            name: "Baraka Shawarma",
            category: .food,
            priceBucket: "$",
            rating: 4.6,
            whyRecommended: "Filling, close, highly rated, and usually under $10.",
            bestFor: request.goal.displayName,
            address: "68 Walton St NW, Atlanta",
            latitude: request.latitude,
            longitude: request.longitude,
            vibeTags: ["casual", "fast-casual"],
            studentValueScore: 0.95,
            confidenceLabel: "medium",
            budgetTip: "Get the chicken plate — it's the most food per dollar.",
            primaryPhotoUrl: nil,
            imageStatus: "none",
            distanceMiles: 0.4,
            tags: tags
        )
        let alternatives = [
            Place(
                id: "food-run-alt-1-\(request.goal.rawValue)",
                name: "Con Leche Coffee",
                category: .food, priceBucket: "$", rating: 4.4,
                whyRecommended: "Cheap breakfast burritos and great coffee.",
                bestFor: nil, address: "120 Edgewood Ave, Atlanta",
                latitude: request.latitude, longitude: request.longitude,
                vibeTags: ["cafe", "quiet"], studentValueScore: 0.8,
                confidenceLabel: "medium", budgetTip: "The breakfast burrito is the value pick.",
                primaryPhotoUrl: nil, imageStatus: "none",
                distanceMiles: 0.6, tags: ["under $10", "quiet study"]
            ),
            Place(
                id: "food-run-alt-2-\(request.goal.rawValue)",
                name: "The Food Shoppe",
                category: .food, priceBucket: "$$", rating: 4.2,
                whyRecommended: "Big portions, good for sharing with friends.",
                bestFor: nil, address: "200 Peachtree St, Atlanta",
                latitude: request.latitude, longitude: request.longitude,
                vibeTags: ["casual", "shareable"], studentValueScore: 0.7,
                confidenceLabel: "low", budgetTip: "Split a platter to keep it cheap.",
                primaryPhotoUrl: nil, imageStatus: "none",
                distanceMiles: 1.1, tags: ["good for students"]
            ),
        ]
        return FoodRunResult(
            place: place,
            alternatives: alternatives,
            estimatedCost: Decimal(9.50),
            reason: "Best \(request.goal.displayName.lowercased()) pick near you for the money.",
            rankingLabel: request.goal == .under10 ? "Best under $10" : "Best overall",
            recommendedOrder: "Get the chicken plate",
            tags: tags,
            matchedDeal: nil,
            confidence: .medium,
            sourceStatus: .estimated
        )
    }

    // MARK: - Deterministic basket builder

    static let defaultRequest = BasketRequest(
        latitude: 33.753, longitude: -84.386,
        budget: 35, goal: .highProtein, timeframe: .threeDays
    )

    /// A small estimated staples catalog used to fill a basket toward budget.
    private struct Staple {
        let name: String
        let category: String
        let price: Double
        let unit: String
        let subs: [String]
    }

    private static let catalog: [Staple] = [
        Staple(name: "Eggs (dozen)", category: "protein", price: 2.49, unit: "dozen", subs: ["Egg whites"]),
        Staple(name: "Chicken thighs", category: "protein", price: 5.49, unit: "lb", subs: ["Chicken breast", "Tofu"]),
        Staple(name: "Greek yogurt", category: "dairy", price: 3.99, unit: "tub", subs: ["Regular yogurt"]),
        Staple(name: "Black beans", category: "pantry", price: 0.99, unit: "can", subs: ["Pinto beans"]),
        Staple(name: "Brown rice", category: "grains", price: 2.79, unit: "bag", subs: ["White rice"]),
        Staple(name: "Rolled oats", category: "grains", price: 2.99, unit: "tub", subs: ["Instant oats"]),
        Staple(name: "Bananas", category: "produce", price: 1.59, unit: "bunch", subs: ["Apples"]),
        Staple(name: "Frozen broccoli", category: "frozen", price: 1.89, unit: "bag", subs: ["Frozen mixed veg"]),
        Staple(name: "Peanut butter", category: "pantry", price: 3.29, unit: "jar", subs: ["Almond butter"]),
        Staple(name: "Whole milk", category: "dairy", price: 3.19, unit: "gallon", subs: ["Oat milk"]),
        Staple(name: "Pasta", category: "grains", price: 1.19, unit: "box", subs: ["Whole wheat pasta"]),
        Staple(name: "Tortillas", category: "grains", price: 2.49, unit: "pack", subs: ["Pita bread"]),
    ]

    static func makeBasket(for request: BasketRequest, id: String) -> SmartBasket {
        // Greedily fill toward budget from the catalog.
        var total = Decimal(0)
        var items: [BasketItem] = []
        let budget = Decimal(request.budget)
        for staple in catalog {
            let price = Decimal(staple.price)
            if total + price > budget { continue }
            total += price
            items.append(BasketItem(
                name: staple.name,
                category: staple.category,
                estimatedPrice: price,
                quantity: 1,
                unit: staple.unit,
                store: "Aldi",
                matchedDealId: nil,
                confidence: .medium,
                trustLabel: .estimated,
                substitutionOptions: staple.subs
            ))
        }

        let savings = Decimal(request.budget) - total
        let coverage = min(100, max(60, items.count * 9))
        let bestStore = StoreRecommendation(
            name: "Aldi",
            placeId: nil,
            kind: .bestSingle,
            score: 0.82,
            estimatedTotal: total,
            estimatedSavings: max(savings, 0),
            distanceMiles: 1.2,
            reason: "Covers ~\(coverage)% of your basket under budget"
        )

        let title = "$\(request.budget) \(request.goal.displayName) Grocery Run"
        return SmartBasket(
            id: id,
            title: title,
            estimatedTotal: total,
            estimatedSavings: max(savings, 0),
            confidence: items.count >= 8 ? .medium : .low,
            sourceStatus: .estimated,
            explanation: "Estimated basket built from known student staples and nearby stores. \(bestStore.name) covers most of it under your $\(request.budget) budget.",
            routeSummary: "1 stop · Aldi · ~1.2 mi",
            bestStore: bestStore,
            optionalSecondStore: nil,
            items: items,
            matchedDeals: [],
            substitutions: []
        )
    }
}
