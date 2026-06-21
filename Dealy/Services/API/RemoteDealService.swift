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
                return try await fetchNearby(preference)
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

    /// Nearby = the server's verified, physical deals within the radius, in the
    /// server's distance+freshness order. Online-only deals are NOT blended in
    /// (spec §6); the client preserves server ordering.
    private func fetchNearby(_ preference: DiscoveryPreference) async throws -> DealPage {
        let nearbyQuery: [URLQueryItem] = [
            URLQueryItem(name: "lat", value: String(preference.center.latitude)),
            URLQueryItem(name: "lng", value: String(preference.center.longitude)),
            URLQueryItem(name: "radiusMiles", value: String(preference.radiusMiles)),
            URLQueryItem(name: "limit", value: "50"),
        ]
        let page = try await client.get("/v1/feeds/nearby", query: nearbyQuery, as: DealPageDTO.self)
        let coverage = page.coverage.map {
            NearbyCoverageStatus(qualified: $0.qualified, reason: $0.reason)
        }
        // Defensive: the server already excludes online deals from nearby and
        // serves none outside a qualified zone.
        let items = page.items.map { $0.toDeal() }.filter { !$0.isOnline }
        return DealPage(items: items, nextCursor: page.nextCursor, coverage: coverage)
    }
}
