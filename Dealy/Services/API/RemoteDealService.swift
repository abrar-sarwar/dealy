import Foundation

/// Backend-backed deal source. Conforms to `DealServicing` so it drops into
/// `AppState` in place of `MockDealService` (e.g.
/// `AppState(dealService: RemoteDealService())`) once the API is deployed.
/// The mock implementation is retained for previews, tests, and offline.
final class RemoteDealService: DealServicing {
    private let client: APIClient

    init(client: APIClient = APIClient(baseURL: APIConfig.baseURL)) {
        self.client = client
    }

    func fetchDeals(for request: DealFeedRequest) async throws -> DealPage {
        do {
            switch request {
            case .nearby(let preference):
                return try await fetchNearbyBlend(preference)
            case .anywhere:
                let page = try await client.get(
                    "/v1/feeds/online",
                    query: [URLQueryItem(name: "limit", value: "50")],
                    as: DealPageDTO.self
                )
                return DealPage(items: page.items.map { $0.toDeal() }, nextCursor: page.nextCursor)
            }
        } catch {
            // Surface a user-friendly error consistent with the existing UI state.
            throw DealServiceError.unavailable
        }
    }

    /// Fetch `/v1/feeds/nearby` and `/v1/feeds/online` concurrently and blend
    /// them: local deals first, online capped at 30% of the page.
    private func fetchNearbyBlend(_ preference: DiscoveryPreference) async throws -> DealPage {
        let nearbyQuery: [URLQueryItem] = [
            URLQueryItem(name: "lat", value: String(preference.center.latitude)),
            URLQueryItem(name: "lng", value: String(preference.center.longitude)),
            URLQueryItem(name: "radiusMiles", value: String(preference.radiusMiles)),
            URLQueryItem(name: "limit", value: "50"),
        ]
        async let nearby = client.get("/v1/feeds/nearby", query: nearbyQuery, as: DealPageDTO.self)
        async let online = client.get(
            "/v1/feeds/online",
            query: [URLQueryItem(name: "limit", value: "20")],
            as: DealPageDTO.self
        )
        let nearbyPage = try await nearby
        let onlinePage = try await online
        // The nearby feed is the local supply; ignore any online deals it returns
        // here and use the dedicated online feed for the capped online share.
        let local = nearbyPage.items.map { $0.toDeal() }.filter { !$0.isOnline }
        let onlineDeals = onlinePage.items.map { $0.toDeal() }
        return DealPage(
            items: DealFilter.blendNearby(local: local, online: onlineDeals),
            nextCursor: nearbyPage.nextCursor
        )
    }
}
