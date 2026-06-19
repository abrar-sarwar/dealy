import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case transport(Error)
    case http(status: Int)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid request."
        case .transport: return "Network connection problem."
        case .http(let status):
            return status == 401 ? "Please sign in again." : "The server returned an error (\(status))."
        case .decoding: return "Unexpected response from the server."
        }
    }
}

/// Minimal async JSON API client. Bearer auth is supplied by an injected token
/// provider (wired to Supabase later); decoding handles ISO-8601 dates with or
/// without fractional seconds.
struct APIClient {
    let baseURL: URL
    var session: URLSession = .shared
    /// Returns a Supabase access token when available (nil for public endpoints).
    var tokenProvider: @Sendable () async -> String? = { nil }

    /// Shared decoder (exposed for DTO-mapping tests).
    static let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = withFractional.date(from: raw) ?? plain.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(raw)")
        }
        return decoder
    }()

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as _: T.Type) async throws -> T {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path),
                                             resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.http(status: -1) }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(status: http.statusCode) }

        do {
            return try Self.jsonDecoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}
