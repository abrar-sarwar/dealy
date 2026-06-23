import Foundation

/// In-memory mock deal source. Deterministic; supports a debug-only simulated
/// failure path so the UI's error state can be exercised without real networking.
final class MockDealService: DealServicing {
    private let reference: Date
    /// When true, the next fetch throws once (test/debug only). Never set in the shipping app.
    var simulateFailureOnce: Bool
    /// Small artificial delay so loading states are visible. Zero in tests.
    private let artificialDelay: Duration

    init(reference: Date = Date(),
         simulateFailureOnce: Bool = false,
         artificialDelay: Duration = .milliseconds(450)) {
        self.reference = reference
        self.simulateFailureOnce = simulateFailureOnce
        self.artificialDelay = artificialDelay
    }

    func fetchDeals(for request: DealFeedRequest) async throws -> DealPage {
        if artificialDelay > .zero {
            try? await Task.sleep(for: artificialDelay)
        }
        if simulateFailureOnce {
            simulateFailureOnce = false
            throw DealServiceError.unavailable
        }

        let all = MockDeals.dataset(reference: reference)

        // Student Perks: curated national programs (the offline/preview double).
        // Curated, so not marked verified.
        if case .student = request {
            let students = all.filter { $0.isStudentOnly }
            return DealPage(items: students, nextCursor: nil)
        }

        // Mirror the production contract: return already-eligible inventory so
        // view models never re-apply location filtering.
        let preference: DiscoveryPreference
        switch request {
        case .nearby(let p): preference = p
        case .anywhere: preference = .default.switching(to: .anywhere)
        case .student: preference = .default.switching(to: .anywhere) // handled by the early return above
        }
        // Mock inventory is curated/trusted, so it stands in for verified deals.
        let items = DealFilter.byDiscovery(all, preference: preference, reference: reference)
            .map { deal -> Deal in
                var d = deal
                d.verified = true
                return d
            }
        return DealPage(items: items, nextCursor: nil)
    }
}
