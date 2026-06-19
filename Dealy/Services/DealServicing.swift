import Foundation

/// Async-friendly boundary for sourcing deals. The mock implementation can be
/// swapped for a backend-backed service later without touching view models.
///
/// TODO: Replace MockDealService with a Supabase-backed implementation.
protocol DealServicing: AnyObject {
    func fetchDeals() async throws -> [Deal]
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
