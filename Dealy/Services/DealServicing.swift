import Foundation

/// What inventory to load: location-anchored Nearby, or online-only Anywhere.
enum DealFeedRequest: Equatable, Sendable {
    case nearby(DiscoveryPreference)
    case anywhere
}

/// A page of already-eligible deals plus an opaque pagination cursor.
struct DealPage: Equatable, Sendable {
    let items: [Deal]
    let nextCursor: String?
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
