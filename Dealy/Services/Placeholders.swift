import Foundation

// MARK: - Future integration boundaries
// These protocols mark where real backends plug in. They are intentionally
// small and live here rather than being scattered through the UI.

// Device-location resolution lives in `LocationProviding.swift` (Core Location).
// Nearby is device-location-only — there is no manual city/ZIP entry.

/// Handles "Get Deal" — opening a merchant link, coupon, map, or affiliate page.
///
/// TODO: Replace with an affiliate/redemption handler when backend lands.
protocol RedemptionHandling {
    func redemptionTitle(for deal: Deal) -> String
}

struct MockRedemptionHandler: RedemptionHandling {
    func redemptionTitle(for deal: Deal) -> String {
        if deal.couponCode != nil { return "Reveal coupon code" }
        if deal.isOnline { return "Open online store" }
        return "Get directions & details"
    }
}

/// Schedules local/push deal alerts.
///
/// TODO: Replace with UNUserNotificationCenter + backend push registration.
protocol NotificationScheduling {
    var alertsEnabled: Bool { get }
}

struct MockNotificationScheduler: NotificationScheduling {
    let alertsEnabled = false
}
