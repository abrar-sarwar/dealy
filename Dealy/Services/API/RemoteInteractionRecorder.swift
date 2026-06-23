import Foundation

/// Backend-syncing interaction recorder. Best-effort + fire-and-forget: each
/// event is posted on a detached Task and any failure is swallowed, so a tracking
/// problem never blocks or delays a UI action. Payloads carry NO precise
/// coordinates — only the deal id (and swipe direction) the event already holds.
/// Wired in `DealyApp` when the app talks to the live API; previews/offline/tests
/// keep `NoopInteractionRecorder`.
final class RemoteInteractionRecorder: DealInteractionRecording {
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func record(_ event: DealInteractionEvent) {
        let route = Self.route(for: event)
        Task.detached { [client] in
            // Best-effort: never surface or retry — tracking must not affect UX.
            try? await client.post(route.path, body: route.body)
        }
    }

    /// Pure mapping from an interaction event to its backend route + JSON body.
    /// Static + side-effect-free so it is unit-testable without networking.
    static func route(for event: DealInteractionEvent) -> (path: String, body: [String: Any]) {
        switch event {
        case .impression(let dealID):
            return ("/v1/deals/\(dealID)/impressions", [:])
        case .opened(let dealID):
            return ("/v1/deals/\(dealID)/opens", [:])
        case .swiped(let dealID, let direction):
            return ("/v1/deals/\(dealID)/swipes", ["direction": direction.rawValue])
        case .redemptionClicked(let dealID):
            return ("/v1/deals/\(dealID)/clicks", [:])
        case let .markedUsed(dealID, savingsAmount, campusID, inventoryClass):
            // Dollars-saved KPI. Decimal serialized as a string to preserve
            // precision. Still carries NO precise coordinates.
            var body: [String: Any] = [
                "savings_amount": String(describing: savingsAmount),
                "inventory_class": inventoryClass,
            ]
            if let campusID { body["campus_id"] = campusID }
            return ("/v1/deals/\(dealID)/redemptions", body)
        }
    }
}
