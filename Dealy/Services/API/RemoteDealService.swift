import Foundation

/// Backend-backed deal source. Conforms to `DealServicing` so it drops into
/// `AppState` in place of `MockDealService` (e.g.
/// `AppState(dealService: RemoteDealService())`) once the API is deployed.
/// The mock implementation is retained for previews, tests, and offline.
final class RemoteDealService: DealServicing, PlaceFeedServicing {
    private let client: APIClient

    init(client: APIClient = APIClient(baseURL: APIConfig.baseURL)) {
        self.client = client
    }

    /// Enriched-place feed sections for the user's location. The backend resolves
    /// `lat`/`lng` to its nearest region and returns a JSON array of sections.
    /// Failures bubble up as `DealServiceError.unavailable` so callers can degrade
    /// gracefully (empty feed) without distinguishing transport vs. decode.
    func fetchPlaceSections(latitude: Double, longitude: Double) async throws -> [PlaceFeedSection] {
        do {
            let sections = try await client.get(
                "/v1/feeds/places",
                query: [
                    URLQueryItem(name: "lat", value: String(latitude)),
                    URLQueryItem(name: "lng", value: String(longitude)),
                ],
                as: [PlaceFeedSectionDTO].self
            )
            return sections.map { $0.toSection() }
        } catch {
            throw DealServiceError.unavailable
        }
    }

    /// Bounded (≤40) map markers for the user's location. The backend resolves
    /// `lat`/`lng` to its nearest region and returns a JSON array of markers.
    /// Failures bubble up as `DealServiceError.unavailable` so the map degrades
    /// gracefully (no markers) without distinguishing transport vs. decode.
    func fetchPlaceMarkers(latitude: Double, longitude: Double) async throws -> [PlaceMarker] {
        do {
            let markers = try await client.get(
                "/v1/feeds/places/map",
                query: [
                    URLQueryItem(name: "lat", value: String(latitude)),
                    URLQueryItem(name: "lng", value: String(longitude)),
                ],
                as: [PlaceMarkerDTO].self
            )
            return markers.map { $0.toMarker() }
        } catch {
            throw DealServiceError.unavailable
        }
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
            case .student:
                // Curated student programs are online; do NOT filter online out.
                let page = try await client.get(
                    "/v1/feeds/student",
                    query: [URLQueryItem(name: "limit", value: "50")],
                    as: DealPageDTO.self
                )
                return DealPage(items: page.items.map { $0.toDeal() }, nextCursor: page.nextCursor)
            case .trending:
                // Cross-campus high-value deals, location-independent (physical or online).
                let page = try await client.get(
                    "/v1/feeds/trending",
                    query: [URLQueryItem(name: "limit", value: "50")],
                    as: DealPageDTO.self
                )
                return DealPage(items: page.items.map { $0.toDeal() }, nextCursor: page.nextCursor)
            case let .local(center, radiusMiles):
                // Curated local deals within radius of a coordinate (physical, 15mi default).
                let page = try await client.get(
                    "/v1/feeds/local",
                    query: [
                        URLQueryItem(name: "lat", value: String(center.latitude)),
                        URLQueryItem(name: "lng", value: String(center.longitude)),
                        URLQueryItem(name: "radiusMiles", value: String(radiusMiles)),
                        URLQueryItem(name: "limit", value: "50"),
                    ],
                    as: DealPageDTO.self
                )
                return DealPage(items: page.items.map { $0.toDeal() }, nextCursor: page.nextCursor)
            case let .missed(center, radiusMiles):
                // Recently-expired local deals (last 7 days), most-recently-expired first.
                // expiresAt is always in the past; items must NEVER be redeemable.
                let page = try await client.get(
                    "/v1/feeds/missed",
                    query: [
                        URLQueryItem(name: "lat", value: String(center.latitude)),
                        URLQueryItem(name: "lng", value: String(center.longitude)),
                        URLQueryItem(name: "radiusMiles", value: String(radiusMiles)),
                        URLQueryItem(name: "limit", value: "50"),
                    ],
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
