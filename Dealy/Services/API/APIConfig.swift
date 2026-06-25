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
    /// Build-time environment. Override via the `DEALY_API_ENV` env var
    /// (local/staging/production). Debug/simulator builds default to `.local` so the
    /// app talks to the local backend; release defaults to production.
    static let environment: APIEnvironment = {
        switch ProcessInfo.processInfo.environment["DEALY_API_ENV"] {
        case "local": return .local
        case "staging": return .staging
        case "production": return .production
        default:
            #if DEBUG
            return .local
            #else
            return .production
            #endif
        }
    }()

    static var baseURL: URL { environment.baseURL }
}
