import Foundation

/// Backend-backed deal source. Conforms to `DealServicing` so it drops into
/// `AppState` in place of `MockDealService` (e.g.
/// `AppState(dealService: RemoteDealService())`) once the API is deployed.
/// The mock implementation is retained for previews, tests, and offline.
final class RemoteDealService: DealServicing {
    private let client: APIClient
    private let query: DealQuery

    init(client: APIClient = APIClient(baseURL: APIConfig.baseURL),
         query: DealQuery = .metroAtlanta) {
        self.client = client
        self.query = query
    }

    func fetchDeals() async throws -> [Deal] {
        try await fetchNearby(query: query)
    }

    /// Fetch published deals near a point from `GET /v1/feeds/nearby`.
    func fetchNearby(query: DealQuery) async throws -> [Deal] {
        let items: [URLQueryItem] = [
            URLQueryItem(name: "lat", value: String(query.latitude)),
            URLQueryItem(name: "lng", value: String(query.longitude)),
            URLQueryItem(name: "radiusMiles", value: String(query.radiusMiles)),
            URLQueryItem(name: "limit", value: "50"),
        ]
        do {
            let page = try await client.get("/v1/feeds/nearby", query: items, as: DealPageDTO.self)
            return page.items.map { $0.toDeal() }
        } catch {
            // Surface a user-friendly error consistent with the existing UI state.
            throw DealServiceError.unavailable
        }
    }
}
