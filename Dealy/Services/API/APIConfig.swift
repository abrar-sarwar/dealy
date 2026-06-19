import Foundation

/// Selectable backend environment. Live calls require a deployed Dealy API
/// (see backend/docs/deployment.md). Defaults to production.
enum APIEnvironment {
    case local
    case staging
    case production

    var baseURL: URL {
        switch self {
        case .local: return URL(string: "http://localhost:3000")!
        case .staging: return URL(string: "https://staging-api.dealy.app")!
        case .production: return URL(string: "https://api.dealy.app")!
        }
    }
}

enum APIConfig {
    /// Build-time environment. Override via the `DEALY_API_ENV` env var (local/staging/production).
    static let environment: APIEnvironment = {
        switch ProcessInfo.processInfo.environment["DEALY_API_ENV"] {
        case "local": return .local
        case "staging": return .staging
        default: return .production
        }
    }()

    static var baseURL: URL { environment.baseURL }
}

/// Geospatial query for the nearby deals feed.
struct DealQuery: Sendable, Equatable {
    let latitude: Double
    let longitude: Double
    let radiusMiles: Int

    /// Broad metro-Atlanta default used until the app passes the user's campus/location.
    static let metroAtlanta = DealQuery(latitude: 33.749, longitude: -84.388, radiusMiles: 50)
}
