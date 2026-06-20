import Foundation
import Observation

enum LoadState: Equatable {
    case idle
    case loading
    case loaded
    case failed(String)
}

/// The app's single composition root. Owns persisted user state, the deal
/// catalog, and every mutation that must stay consistent across screens.
/// Saved/watched state is keyed by deal id and never duplicated into deals.
@Observable
final class AppState {

    // MARK: Dependencies (injected, replaceable)
    private let store: PreferenceStoring
    private let dealService: DealServicing
    let redemptionHandler: RedemptionHandling

    // MARK: State
    private(set) var persisted: PersistedState
    private(set) var allDeals: [Deal] = []
    private(set) var dealsByID: [String: Deal] = [:]
    private(set) var loadState: LoadState = .idle

    private let maxSwipeHistory = 60

    init(store: PreferenceStoring = UserDefaultsPreferencesStore(),
         dealService: DealServicing = MockDealService(),
         redemptionHandler: RedemptionHandling = MockRedemptionHandler()) {
        self.store = store
        self.dealService = dealService
        self.redemptionHandler = redemptionHandler
        self.persisted = store.load()
    }

    // MARK: - Loading

    @MainActor
    func loadDeals() async {
        loadState = .loading
        do {
            let deals = try await dealService.fetchDeals()
            allDeals = deals
            dealsByID = Dictionary(uniqueKeysWithValues: deals.map { ($0.id, $0) })
            loadState = .loaded
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    func deal(id: String) -> Deal? { dealsByID[id] }

    // MARK: - Onboarding

    var hasCompletedOnboarding: Bool { persisted.hasCompletedOnboarding }

    func completeOnboarding(campus: Campus, radius: Int, interests: Set<DealCategory>) {
        persisted.hasCompletedOnboarding = true
        persisted.discovery = .nearby(center: .legacyCampus(campus), radiusMiles: radius)
        persisted.interests = interests
        persist()
    }

    func resetOnboarding() {
        persisted.hasCompletedOnboarding = false
        persist()
    }

    // MARK: - Location & interests

    var discovery: DiscoveryPreference { persisted.discovery }
    var currentCampus: Campus { Self.compatibilityCampus(for: persisted.discovery.center) }
    var radius: Int { persisted.discovery.radiusMiles }
    var interests: Set<DealCategory> { persisted.interests }

    func setDiscovery(_ preference: DiscoveryPreference) {
        persisted.discovery = preference
        persist()
    }

    func selectCampus(_ campus: Campus, radius: Int? = nil) {
        let nextRadius = radius ?? persisted.discovery.radiusMiles
        setDiscovery(.nearby(center: .legacyCampus(campus), radiusMiles: nextRadius))
    }

    func setRadius(_ value: Int) {
        persisted.discovery = updatedDiscovery(radiusMiles: min(max(value, Campus.minRadius), Campus.maxRadius))
        persist()
    }

    func setInterests(_ interests: Set<DealCategory>) {
        persisted.interests = interests
        persist()
    }

    func toggleInterest(_ category: DealCategory) {
        if persisted.interests.contains(category) {
            persisted.interests.remove(category)
        } else {
            persisted.interests.insert(category)
        }
        persist()
    }

    // MARK: - Saved deals

    func isSaved(_ id: String) -> Bool { persisted.savedDealIDs.contains(id) }

    var savedDeals: [Deal] {
        // Most-recent-first for display.
        persisted.savedDealIDs.reversed().compactMap { dealsByID[$0] }
    }

    var savedCount: Int { persisted.savedDealIDs.count }

    func save(_ id: String) {
        guard !persisted.savedDealIDs.contains(id) else { return }
        persisted.savedDealIDs.append(id)
        persist()
    }

    func unsave(_ id: String) {
        persisted.savedDealIDs.removeAll { $0 == id }
        persist()
    }

    @discardableResult
    func toggleSaved(_ id: String) -> Bool {
        if isSaved(id) { unsave(id); return false }
        save(id); return true
    }

    // MARK: - Watched deals

    func isWatched(_ id: String) -> Bool { persisted.watchedDealIDs.contains(id) }

    var watchedCount: Int { persisted.watchedDealIDs.count }

    var watchedDeals: [Deal] {
        persisted.watchedDealIDs.compactMap { dealsByID[$0] }
    }

    @discardableResult
    func toggleWatched(_ id: String) -> Bool {
        if persisted.watchedDealIDs.contains(id) {
            persisted.watchedDealIDs.remove(id); persist(); return false
        }
        persisted.watchedDealIDs.insert(id); persist(); return true
    }

    // MARK: - Swiping & undo

    /// Record a swipe. Right-swipes save the deal. Returns the action recorded.
    @discardableResult
    func recordSwipe(dealID: String, direction: SwipeDirection) -> SwipeAction {
        let action = SwipeAction(dealID: dealID, direction: direction, wasSavedBefore: isSaved(dealID))
        if direction == .right { save(dealID) }
        persisted.swipeHistory.append(action)
        if persisted.swipeHistory.count > maxSwipeHistory {
            persisted.swipeHistory.removeFirst(persisted.swipeHistory.count - maxSwipeHistory)
        }
        persist()
        return action
    }

    /// Undo the most recent swipe, restoring the prior saved state. Returns the
    /// deal id that should re-enter the deck, or nil if nothing to undo.
    @discardableResult
    func undoLastSwipe() -> String? {
        guard let last = persisted.swipeHistory.popLast() else { return nil }
        // Restore saved state to exactly what it was before the swipe.
        if last.wasSavedBefore {
            save(last.dealID)
        } else {
            unsave(last.dealID)
        }
        persist()
        return last.dealID
    }

    var swipedDealIDs: Set<String> { Set(persisted.swipeHistory.map { $0.dealID }) }

    var lastSwipe: SwipeAction? { persisted.swipeHistory.last }

    // MARK: - Realized (mock) savings

    /// Mark a deal as used. Adds its savings exactly once (no double counting).
    /// Returns true if it was newly counted.
    @discardableResult
    func markUsed(_ deal: Deal) -> Bool {
        guard !persisted.savingsEvents.contains(where: { $0.dealID == deal.id }) else { return false }
        guard deal.savingsAmount > 0 else { return false }
        let event = SavingsEvent(dealID: deal.id, dealTitle: deal.title, amount: deal.savingsAmount)
        persisted.savingsEvents.append(event)
        persist()
        return true
    }

    func hasBeenUsed(_ id: String) -> Bool {
        persisted.savingsEvents.contains { $0.dealID == id }
    }

    /// Sum of savings across currently-saved deals (potential, not realized).
    var totalPotentialSavings: Decimal {
        savedDeals.reduce(Decimal(0)) { $0 + $1.savingsAmount }
    }

    var totalRealizedSavings: Decimal {
        persisted.savingsEvents.reduce(Decimal(0)) { $0 + $1.amount }
    }

    /// Realized savings within the current calendar month.
    func realizedSavings(inMonthOf date: Date = Date(), calendar: Calendar = .current) -> Decimal {
        persisted.savingsEvents
            .filter { calendar.isDate($0.date, equalTo: date, toGranularity: .month) }
            .reduce(Decimal(0)) { $0 + $1.amount }
    }

    // MARK: - Notifications preference

    var notificationsEnabled: Bool { persisted.notificationsEnabled }
    func setNotificationsEnabled(_ on: Bool) {
        persisted.notificationsEnabled = on
        persist()
    }

    // MARK: - Debug / reset

    /// Clear swipe history and realized savings; keep saved deals & preferences.
    func resetDealHistory() {
        persisted.swipeHistory.removeAll()
        persisted.savingsEvents.removeAll()
        persist()
    }

    /// Reload the mock dataset without destroying user preferences.
    @MainActor
    func restoreDataset() async {
        await loadDeals()
    }

    // MARK: - Persistence

    private func persist() { store.save(persisted) }

    private func updatedDiscovery(
        mode: DiscoveryMode? = nil,
        center: DiscoveryCenter? = nil,
        radiusMiles: Int? = nil,
        updatedAt: Date = Date()
    ) -> DiscoveryPreference {
        let current = persisted.discovery
        return DiscoveryPreference
            .nearby(
                center: center ?? current.center,
                radiusMiles: radiusMiles ?? current.radiusMiles,
                updatedAt: updatedAt
            )
            .switching(to: mode ?? current.mode, updatedAt: updatedAt)
    }

    private static func compatibilityCampus(for center: DiscoveryCenter) -> Campus {
        if let exact = Campus.all.first(where: {
            $0.name == center.displayName &&
            $0.latitude == center.latitude &&
            $0.longitude == center.longitude
        }) {
            return exact
        }

        return Campus.all.min(by: { lhs, rhs in
            squaredDistance(from: center, to: lhs) < squaredDistance(from: center, to: rhs)
        }) ?? .atlanta
    }

    private static func squaredDistance(from center: DiscoveryCenter, to campus: Campus) -> Double {
        let lat = center.latitude - campus.latitude
        let lon = center.longitude - campus.longitude
        return (lat * lat) + (lon * lon)
    }
}
