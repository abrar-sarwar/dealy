import Foundation

/// What inventory to load: location-anchored Nearby, or online-only Anywhere.
enum DealFeedRequest: Equatable, Sendable {
    case nearby(DiscoveryPreference)
    case anywhere
    /// Curated national student programs (Apple Education, Spotify Student, …).
    /// Always available regardless of location.
    case student
    /// Cross-campus high-value/urgent deals, featured regardless of location.
    case trending
    /// Curated local deals (restaurants, student discounts, …) within a radius
    /// of a coordinate. Curated trust; its own discovery surface.
    case local(center: DiscoveryCenter, radiusMiles: Int)
    /// Recently-expired local deals (expired within the last 7 days), most-recently-
    /// expired first. Items are NEVER redeemable — expiresAt is always in the past.
    case missed(center: DiscoveryCenter, radiusMiles: Int)
}

/// Density-first Nearby coverage status from the server. `qualified == false`
/// means the user is outside the launched Atlanta pilot area (or it isn't dense
/// enough yet) and Nearby intentionally serves no deals — the UI shows an honest
/// low-coverage state and offers Anywhere. Never exposes internal zone details.
struct NearbyCoverageStatus: Equatable, Sendable {
    let qualified: Bool
    /// Server reason code: "qualified" | "outside_coverage" | "low_coverage".
    let reason: String
}

/// A page of already-eligible deals plus an opaque pagination cursor. `coverage`
/// is set for Nearby requests (nil for Anywhere / mock).
struct DealPage: Equatable, Sendable {
    let items: [Deal]
    let nextCursor: String?
    var coverage: NearbyCoverageStatus? = nil
}

/// Async-friendly boundary for sourcing deals. Implementations return inventory
/// that already satisfies the discovery request, so view models don't re-apply
/// location eligibility.
protocol DealServicing: AnyObject {
    func fetchDeals(for request: DealFeedRequest) async throws -> DealPage
}

extension DiscoveryPreference {
    /// The feed request implied by this preference: Anywhere is online-only,
    /// everything else is a location-anchored Nearby request.
    var feedRequest: DealFeedRequest {
        switch mode {
        case .anywhere: return .anywhere
        case .nearby: return .nearby(self)
        }
    }
}

enum DealServiceError: LocalizedError {
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "We couldn't load deals just now."
        }
    }
}
