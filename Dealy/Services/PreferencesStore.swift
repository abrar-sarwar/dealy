import Foundation

/// The complete set of locally-persisted, user-facing state. One codable value
/// so persistence stays in one place and is easy to replace or migrate.
struct PersistedState: Codable, Equatable {
    var hasCompletedOnboarding = false
    var campusID: String = Campus.georgiaState.id
    var radius: Int = Campus.georgiaState.defaultRadius
    var interests: Set<DealCategory> = []
    var savedDealIDs: [String] = []          // ordered: most recently saved last
    var watchedDealIDs: Set<String> = []
    var swipeHistory: [SwipeAction] = []      // capped, newest last
    var savingsEvents: [SavingsEvent] = []    // realized mock savings, deduped by dealID
    var notificationsEnabled = false

    static let `default` = PersistedState()
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
