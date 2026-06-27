import Foundation

/// Backend-backed Smart Basket source. Conforms to `SmartBasketServicing` so it
/// drops into `AppState` in place of `MockSmartBasketService`. Failures bubble up
/// as `SmartBasketError.unavailable` so callers can degrade gracefully without
/// distinguishing transport vs. decode.
final class RemoteSmartBasketService: SmartBasketServicing {
    private let client: APIClient

    init(client: APIClient = APIClient(baseURL: APIConfig.baseURL)) {
        self.client = client
    }

    func generate(_ request: BasketRequest) async throws -> SmartBasket {
        do {
            let dto = try await client.post(
                "/v1/grocery/baskets/generate",
                body: request.jsonBody,
                as: BasketDTO.self
            )
            return dto.toDomain()
        } catch {
            throw SmartBasketError.unavailable
        }
    }

    func regenerate(id: String) async throws -> SmartBasket {
        do {
            let dto = try await client.post(
                "/v1/grocery/baskets/\(id)/regenerate",
                as: BasketDTO.self
            )
            return dto.toDomain()
        } catch {
            throw SmartBasketError.unavailable
        }
    }

    func basket(id: String) async throws -> SmartBasket {
        do {
            let dto = try await client.get(
                "/v1/grocery/baskets/\(id)",
                as: BasketDTO.self
            )
            return dto.toDomain()
        } catch {
            throw SmartBasketError.unavailable
        }
    }

    func foodRun(_ request: FoodRunRequest) async throws -> FoodRunResult {
        do {
            let dto = try await client.post(
                "/v1/feeds/food-run",
                body: request.jsonBody,
                as: FoodRunDTO.self
            )
            return dto.toDomain()
        } catch {
            throw SmartBasketError.unavailable
        }
    }
}
