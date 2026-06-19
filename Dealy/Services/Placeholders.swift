import Foundation

// MARK: - Future integration boundaries
// These protocols mark where real backends plug in. They are intentionally
// small and live here rather than being scattered through the UI.

/// Resolves the user's location. The MVP uses an explicit campus/city choice
/// instead of CoreLocation, so this is a no-op placeholder.
///
/// TODO: Replace with a CoreLocation-backed provider once permissions ship.
protocol LocationProviding {
    var usesDeviceLocation: Bool { get }
}

struct MockLocationProvider: LocationProviding {
    let usesDeviceLocation = false
}

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
