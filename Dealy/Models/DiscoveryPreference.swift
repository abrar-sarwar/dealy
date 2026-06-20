import Foundation

enum DiscoveryMode: String, Codable, CaseIterable {
    case nearby
    case anywhere
}

enum DiscoverySource: String, Codable {
    case device
    case manual
    case legacyCampus
}

struct DiscoveryCenter: Codable, Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    let displayName: String
    let source: DiscoverySource

    static func legacyCampus(_ campus: Campus) -> Self {
        Self(
            latitude: campus.latitude,
            longitude: campus.longitude,
            displayName: campus.name,
            source: .legacyCampus
        )
    }
}

struct DiscoveryPreference: Codable, Equatable, Sendable {
    static let minRadius = 1
    static let maxRadius = 100
    static let defaultRadius = 10

    var mode: DiscoveryMode
    var center: DiscoveryCenter
    var radiusMiles: Int
    var updatedAt: Date

    static func nearby(
        center: DiscoveryCenter,
        radiusMiles: Int = defaultRadius,
        updatedAt: Date = Date()
    ) -> Self {
        Self(
            mode: .nearby,
            center: center,
            radiusMiles: min(max(radiusMiles, minRadius), maxRadius),
            updatedAt: updatedAt
        )
    }

    static let `default` = nearby(
        center: .legacyCampus(.atlanta),
        radiusMiles: defaultRadius,
        updatedAt: .distantPast
    )

    func switching(to mode: DiscoveryMode, updatedAt: Date = Date()) -> Self {
        var copy = self
        copy.mode = mode
        copy.updatedAt = updatedAt
        return copy
    }
}
