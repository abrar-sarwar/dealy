import Foundation

/// Async boundary for the Smart Basket feature: generate an auto-built,
/// store-routed, price-estimated grocery basket from a budget + goal, re-roll it,
/// fetch a persisted one, and run the lightweight "Cheap Food Run".
///
/// The backend works without auth (public endpoints) and out-of-area, returning a
/// clearly-labeled estimated basket when verified grocery deals are thin.
protocol SmartBasketServicing: AnyObject, Sendable {
    /// `POST /v1/grocery/baskets/generate`
    func generate(_ request: BasketRequest) async throws -> SmartBasket

    /// `POST /v1/grocery/baskets/:id/regenerate` — re-rolls the same parameters.
    func regenerate(id: String) async throws -> SmartBasket

    /// `GET /v1/grocery/baskets/:id`
    func basket(id: String) async throws -> SmartBasket

    /// `POST /v1/feeds/food-run` — single best place for a cheap food run.
    func foodRun(_ request: FoodRunRequest) async throws -> FoodRunResult
}

/// Error surfaced when the Smart Basket service can't complete a request.
enum SmartBasketError: LocalizedError {
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "We couldn't build your basket just now. Please try again."
        }
    }
}
