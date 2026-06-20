import Foundation

/// The complete set of locally-persisted, user-facing state. One codable value
/// so persistence stays in one place and is easy to replace or migrate.
struct PersistedState: Codable, Equatable {
    var hasCompletedOnboarding = false
    var discovery: DiscoveryPreference = .default
    var interests: Set<DealCategory> = []
    var savedDealIDs: [String] = []          // ordered: most recently saved last
    var watchedDealIDs: Set<String> = []
    var swipeHistory: [SwipeAction] = []      // capped, newest last
    var savingsEvents: [SavingsEvent] = []    // realized mock savings, deduped by dealID
    var notificationsEnabled = false

    init() {}

    private enum CodingKeys: String, CodingKey {
        case hasCompletedOnboarding
        case discovery
        case campusID
        case radius
        case interests
        case savedDealIDs
        case watchedDealIDs
        case swipeHistory
        case savingsEvents
        case notificationsEnabled
    }

    init(from decoder: Decoder) throws {
        self.init()

        let container = try decoder.container(keyedBy: CodingKeys.self)
        hasCompletedOnboarding = try container.decodeIfPresent(Bool.self, forKey: .hasCompletedOnboarding) ?? false

        if let decodedDiscovery = try? container.decode(DiscoveryPreference.self, forKey: .discovery) {
            discovery = decodedDiscovery
        } else {
            let campus = Self.legacyCampus(withID: try container.decodeIfPresent(String.self, forKey: .campusID))
            let radius = Self.legacyRadius(from: try container.decodeIfPresent(Int.self, forKey: .radius))
            discovery = .nearby(
                center: .legacyCampus(campus),
                radiusMiles: radius,
                updatedAt: .distantPast
            )
        }

        interests = try container.decodeIfPresent(Set<DealCategory>.self, forKey: .interests) ?? []
        savedDealIDs = try container.decodeIfPresent([String].self, forKey: .savedDealIDs) ?? []
        watchedDealIDs = try container.decodeIfPresent(Set<String>.self, forKey: .watchedDealIDs) ?? []
        swipeHistory = try container.decodeIfPresent([SwipeAction].self, forKey: .swipeHistory) ?? []
        savingsEvents = try container.decodeIfPresent([SavingsEvent].self, forKey: .savingsEvents) ?? []
        notificationsEnabled = try container.decodeIfPresent(Bool.self, forKey: .notificationsEnabled) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(hasCompletedOnboarding, forKey: .hasCompletedOnboarding)
        try container.encode(discovery, forKey: .discovery)
        try container.encode(interests, forKey: .interests)
        try container.encode(savedDealIDs, forKey: .savedDealIDs)
        try container.encode(watchedDealIDs, forKey: .watchedDealIDs)
        try container.encode(swipeHistory, forKey: .swipeHistory)
        try container.encode(savingsEvents, forKey: .savingsEvents)
        try container.encode(notificationsEnabled, forKey: .notificationsEnabled)
    }

    static let `default` = PersistedState()

    private static func legacyCampus(withID id: String?) -> Campus {
        Campus.all.first { $0.id == id } ?? .atlanta
    }

    private static func legacyRadius(from persistedRadius: Int?) -> Int {
        guard let persistedRadius,
              (DiscoveryPreference.minRadius...DiscoveryPreference.maxRadius).contains(persistedRadius)
        else { return DiscoveryPreference.defaultRadius }
        return persistedRadius
    }
}

/// Boundary for persisting `PersistedState`. Swappable for a real backend store.
///
/// TODO: Replace UserDefaultsPreferencesStore with a backend-synced store.
protocol PreferenceStoring: AnyObject {
    func load() -> PersistedState
    func save(_ state: PersistedState)
}

/// Default implementation backed by UserDefaults + JSON. The single raw key
/// lives only here.
final class UserDefaultsPreferencesStore: PreferenceStoring {
    private let key = "com.dealy.persistedState.v1"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> PersistedState {
        guard let data = defaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode(PersistedState.self, from: data)
        else { return .default }
        return decoded
    }

    func save(_ state: PersistedState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }
}

/// In-memory store for tests/previews.
final class InMemoryPreferencesStore: PreferenceStoring {
    private var state: PersistedState
    init(_ state: PersistedState = .default) { self.state = state }
    func load() -> PersistedState { state }
    func save(_ state: PersistedState) { self.state = state }
}
