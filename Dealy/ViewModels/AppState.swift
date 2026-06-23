import CoreLocation
import Foundation
import Observation

enum LoadState: Equatable {
    case idle
    case loading
    case loaded
    case failed(String)
}

/// Explicit, named interaction signals captured at real user-action boundaries.
/// Deliberately NOT an AI/ranking hook — just a durable analytics seam a backend
/// recommender (or "Ask Dealy") can consume later. No event is emitted for
/// browsing/location changes.
enum DealInteractionEvent: Equatable {
    case impression(dealID: String)
    case opened(dealID: String)
    case swiped(dealID: String, direction: SwipeDirection)
    case redemptionClicked(dealID: String)
    /// Realized savings — the primary KPI boundary. Carries the dollar amount
    /// saved, the assigned campus (if any), and the deal's inventory class so the
    /// backend can aggregate total dollars saved by students.
    case markedUsed(dealID: String, savingsAmount: Decimal, campusID: String?, inventoryClass: String)
}

/// Sink for interaction events. The shipping default is a no-op until
/// authenticated backend event sync is enabled.
protocol DealInteractionRecording {
    func record(_ event: DealInteractionEvent)
}

/// Default no-op recorder. Swap for a backend-syncing implementation later.
struct NoopInteractionRecorder: DealInteractionRecording {
    func record(_ event: DealInteractionEvent) {}
}

/// The app's single composition root. Owns persisted user state, the deal
/// catalog, and every mutation that must stay consistent across screens.
/// Saved/watched state is keyed by deal id and never duplicated into deals.
@Observable
final class AppState {

    // MARK: Dependencies (injected, replaceable)
    private let store: PreferenceStoring
    private let dealService: DealServicing
    private let locationProvider: LocationProviding
    private let interactionRecorder: DealInteractionRecording
    let redemptionHandler: RedemptionHandling
    /// Finds physical stores for an online deal's redemption brand (MapKit).
    let nearbyStores: NearbyStoreSearching

    // MARK: State
    private(set) var persisted: PersistedState
    private(set) var allDeals: [Deal] = []
    /// Curated national student programs for the Student Perks section. Loaded
    /// independently of the main deck; always available regardless of location.
    private(set) var studentDeals: [Deal] = []
    /// Cross-campus trending deals (high-value/urgent), featured regardless of
    /// location. Loaded independently of the main deck.
    private(set) var trendingDeals: [Deal] = []
    /// Curated local deals (restaurants, student discounts, …) within ~15mi of
    /// the active discovery center. Curated trust; its own discovery surface.
    private(set) var localDeals: [Deal] = []
    private(set) var dealsByID: [String: Deal] = [:]
    private(set) var loadState: LoadState = .idle
    /// Server density-first coverage for the last Nearby load (nil for Anywhere).
    private(set) var nearbyCoverage: NearbyCoverageStatus?

    private let maxSwipeHistory = 60
    /// Monotonic load token: only the newest in-flight load may publish results.
    private var loadGeneration = 0

    init(store: PreferenceStoring = UserDefaultsPreferencesStore(),
         dealService: DealServicing = MockDealService(),
         locationProvider: LocationProviding = MockLocationProvider(),
         redemptionHandler: RedemptionHandling = MockRedemptionHandler(),
         interactionRecorder: DealInteractionRecording = NoopInteractionRecorder(),
         nearbyStores: NearbyStoreSearching = MockNearbyStoresService()) {
        self.store = store
        self.dealService = dealService
        self.nearbyStores = nearbyStores
        self.locationProvider = locationProvider
        self.redemptionHandler = redemptionHandler
        self.interactionRecorder = interactionRecorder
        self.persisted = store.load()
    }

    // MARK: - Loading

    /// Load the deck for `request` (defaults to the current discovery preference).
    /// A stale response from an earlier request can never replace a newer one.
    @MainActor
    func loadDeals(for request: DealFeedRequest? = nil) async {
        loadGeneration += 1
        let generation = loadGeneration
        let activeRequest = request ?? discovery.feedRequest
        loadState = .loading
        do {
            let page = try await dealService.fetchDeals(for: activeRequest)
            guard generation == loadGeneration else { return }
            allDeals = page.items
            dealsByID = Dictionary(uniqueKeysWithValues: page.items.map { ($0.id, $0) })
            nearbyCoverage = page.coverage
            loadState = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            loadState = .failed(error.localizedDescription)
        }
    }

    func deal(id: String) -> Deal? { dealsByID[id] }

    /// Load curated national student programs for the Student Perks section.
    /// Independent of the main deck; failures leave the section empty (the UI
    /// shows an empty state) and never block the app. Loaded programs are merged
    /// into `dealsByID` so detail/save/watch lookups resolve them.
    @MainActor
    func loadStudentDeals() async {
        do {
            let page = try await dealService.fetchDeals(for: .student)
            studentDeals = page.items
            for deal in page.items { dealsByID[deal.id] = deal }
        } catch {
            studentDeals = []
        }
    }

    /// Load cross-campus trending deals for the Trending section. Independent of
    /// the main deck; failures leave the section empty and never block the app.
    /// Loaded deals are merged into `dealsByID` so detail/save/watch resolve them.
    @MainActor
    func loadTrendingDeals() async {
        do {
            let page = try await dealService.fetchDeals(for: .trending)
            trendingDeals = page.items
            for deal in page.items { dealsByID[deal.id] = deal }
        } catch {
            trendingDeals = []
        }
    }

    /// Load curated local deals within `radiusMiles` (default 15) of the active
    /// discovery center. Independent of the deck; failures leave it empty and
    /// never block. Loaded deals are merged into `dealsByID` for detail lookups.
    @MainActor
    func loadLocalDeals(radiusMiles: Int = 15) async {
        do {
            let page = try await dealService.fetchDeals(
                for: .local(center: persisted.discovery.center, radiusMiles: radiusMiles))
            localDeals = page.items
            for deal in page.items { dealsByID[deal.id] = deal }
        } catch {
            localDeals = []
        }
    }

    // MARK: - Discovery (atomic updates)

    /// Persist a new discovery preference and reload the deck for it atomically.
    @MainActor
    func applyDiscovery(_ preference: DiscoveryPreference) async {
        persisted.discovery = preference
        persist()
        await loadDeals(for: preference.feedRequest)
    }

    /// Resolve the device's current location (When-In-Use) and switch Nearby to
    /// it, preserving the current radius. Throws a typed `LocationProviderError`.
    @MainActor
    func refreshFromDeviceLocation() async throws {
        let center = try await locationProvider.currentCenter()
        await applyDiscovery(.nearby(center: center, radiusMiles: discovery.radiusMiles))
    }

    /// Try to enter Nearby using the device's location; on ANY failure fall back
    /// to Anywhere (online-only) without blocking the app. Returns the failure so
    /// callers can show a calm explanation + "Enable Nearby" affordance. Used at
    /// onboarding and from the "Enable Nearby deals" action.
    @discardableResult
    @MainActor
    func enableNearbyOrFallbackToAnywhere() async -> LocationProviderError? {
        do {
            try await refreshFromDeviceLocation()
            return nil
        } catch let error as LocationProviderError {
            await switchToAnywhere()
            return error
        } catch {
            await switchToAnywhere()
            return .unavailable
        }
    }

    /// Enter Anywhere (online-only). Never requires location permission.
    @MainActor
    func switchToAnywhere() async {
        await applyDiscovery(discovery.switching(to: .anywhere))
    }

    /// Switch to Nearby. Prefer a fresh device fix; if that fails, reuse the last
    /// VALID device location when we have one; otherwise stay honest and use
    /// Anywhere rather than fabricated/default coordinates.
    @discardableResult
    @MainActor
    func switchToNearby() async -> LocationProviderError? {
        do {
            try await refreshFromDeviceLocation()
            return nil
        } catch let error as LocationProviderError {
            if discovery.center.source == .device {
                await applyDiscovery(.nearby(center: discovery.center, radiusMiles: discovery.radiusMiles))
                return nil
            }
            await switchToAnywhere()
            return error
        } catch {
            await switchToAnywhere()
            return .unavailable
        }
    }

    /// Resolve the device's current center WITHOUT applying it, for editors that
    /// stage a draft before committing. Throws a typed `LocationProviderError`.
    @MainActor
    func resolveDeviceCenter() async throws -> DiscoveryCenter {
        try await locationProvider.currentCenter()
    }

    /// Current location-permission state (for showing share/Settings prompts).
    @MainActor
    var locationAuthorization: LocationAuthorization { locationProvider.authorization }

    /// Whether the user intentionally dismissed the "Enable Nearby" nudge. We
    /// honor this so we don't repeatedly nag people who chose to stay in Anywhere.
    var anywhereNudgeDismissed: Bool { persisted.anywhereNudgeDismissed }
    func dismissAnywhereNudge() {
        persisted.anywhereNudgeDismissed = true
        persist()
    }

    // MARK: - Onboarding

    var hasCompletedOnboarding: Bool { persisted.hasCompletedOnboarding }

    /// Prepare first-run discovery without presenting a dedicated location step.
    /// Nearby is selected when a device fix succeeds; all failures continue
    /// honestly in Anywhere so onboarding is never blocked.
    @MainActor
    func prepareDiscoveryForOnboarding() async {
        _ = await enableNearbyOrFallbackToAnywhere()
    }

    /// Re-detect the campus from a fresh device fix on app activation. No-op
    /// while a manual override is active (we never stomp a user's correction).
    /// Failures fall back honestly without blocking, matching onboarding — and
    /// because campus assignment is advisory, falling back never removes deals.
    @MainActor
    func refreshCampusOnForeground() async {
        guard !isCampusOverridden else { return }
        _ = await enableNearbyOrFallbackToAnywhere()
    }

    func completeOnboarding(campus: Campus, radius: Int, interests: Set<DealCategory>) {
        persisted.hasCompletedOnboarding = true
        persisted.discovery = .nearby(center: .legacyCampus(campus), radiusMiles: radius)
        persisted.interests = interests
        persist()
    }

    /// Finish onboarding, persisting interests. Discovery was prepared
    /// automatically during the first-run flow, so it is left untouched here.
    func completeOnboarding(interests: Set<DealCategory>) {
        persisted.hasCompletedOnboarding = true
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

    // MARK: - Campus assignment (advisory — never gates deal access)

    /// Automatic campus match for the active discovery center. Feeds
    /// ranking/personalization and analytics ONLY; it can never remove a deal
    /// from the feed. A center that is not a real device fix yields
    /// `.unavailable` (we don't pretend a legacy anchor is the user's location).
    var campusAssignment: CampusAssignment {
        guard persisted.discovery.center.source == .device else { return .unavailable }
        return CampusLocator.locate(from: CLLocationCoordinate2D(
            latitude: persisted.discovery.center.latitude,
            longitude: persisted.discovery.center.longitude
        ))
    }

    /// Whether the user manually corrected their campus in Settings.
    var isCampusOverridden: Bool { persisted.manualCampusOverride }

    /// Demoted correction: pin a campus and stop auto-detect from stomping it.
    func selectCampusOverride(_ campus: Campus) {
        persisted.manualCampusOverride = true
        selectCampus(campus)            // existing helper: sets a legacy campus center
    }

    /// Resume automatic detection.
    func clearCampusOverride() {
        persisted.manualCampusOverride = false
        persist()
    }

    func setDiscovery(_ preference: DiscoveryPreference) {
        persisted.discovery = preference
        persist()
    }

    func selectCampus(_ campus: Campus, radius: Int? = nil) {
        let nextRadius = radius ?? persisted.discovery.radiusMiles
        setDiscovery(.nearby(center: .legacyCampus(campus), radiusMiles: nextRadius))
    }

    func setRadius(_ value: Int) {
        persisted.discovery = updatedDiscovery(
            radiusMiles: min(max(value, DiscoveryPreference.minRadius), DiscoveryPreference.maxRadius)
        )
        persist()
    }

    /// Clamp + persist a new radius AND immediately refresh the feed so Home (and
    /// every other discovery consumer) reflects the change right away.
    @MainActor
    func setRadiusAndReload(_ value: Int) async {
        let clamped = min(max(value, DiscoveryPreference.minRadius), DiscoveryPreference.maxRadius)
        await applyDiscovery(updatedDiscovery(radiusMiles: clamped))
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
        interactionRecorder.record(.swiped(dealID: dealID, direction: direction))
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
        // Emit the dollars-saved KPI signal with campus + inventory-class context.
        let campusID: String?
        if case let .assigned(campus, _) = campusAssignment { campusID = campus.id } else { campusID = nil }
        interactionRecorder.record(.markedUsed(
            dealID: deal.id,
            savingsAmount: deal.savingsAmount,
            campusID: campusID,
            inventoryClass: InventoryClassifier.classify(deal).rawValue
        ))
        return true
    }

    // MARK: - Interaction signals

    /// Record that a deal's detail was opened.
    func recordOpened(_ dealID: String) {
        interactionRecorder.record(.opened(dealID: dealID))
    }

    /// Record that the user tapped "Get Deal" (redemption intent).
    func recordRedemptionClicked(_ dealID: String) {
        interactionRecorder.record(.redemptionClicked(dealID: dealID))
    }

    /// Deal ids already counted as impressions this session (dedup policy: one
    /// impression per deal per session; the backend additionally dedups per day).
    private var impressedDealIDs: Set<String> = []

    /// Record that a deal card was shown to the user (deduped per session).
    func recordImpression(_ dealID: String) {
        guard impressedDealIDs.insert(dealID).inserted else { return }
        interactionRecorder.record(.impression(dealID: dealID))
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
