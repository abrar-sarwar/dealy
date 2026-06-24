import Foundation

/// Reusable, locale-aware formatters. Money and dates are always formatted
/// through these — never hand-concatenated.
enum Format {

    private static let currency: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = .current
        f.maximumFractionDigits = 2
        f.minimumFractionDigits = 2
        return f
    }()

    private static let currencyWhole: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = .current
        f.maximumFractionDigits = 0
        return f
    }()

    /// "$5.99"
    static func price(_ value: Decimal) -> String {
        currency.string(from: NSDecimalNumber(decimal: value)) ?? "$0.00"
    }

    /// "$6" — rounds to whole dollars, used for savings call-outs.
    static func moneyWhole(_ value: Decimal) -> String {
        let rounded = NSDecimalNumber(decimal: value).rounding(accordingToBehavior: nil)
        return currencyWhole.string(from: rounded) ?? "$0"
    }

    /// "$124.50" — exact, for totals.
    static func moneyExact(_ value: Decimal) -> String {
        currency.string(from: NSDecimalNumber(decimal: value)) ?? "$0.00"
    }

    /// Compact countdown like "2h", "45m", "3d", or "Expired".
    static func expiryShort(_ date: Date, reference: Date = Date()) -> String {
        let interval = date.timeIntervalSince(reference)
        if interval <= 0 { return "Expired" }
        let minutes = Int(interval / 60)
        if minutes < 60 { return "\(max(minutes, 1))m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        let days = hours / 24
        return "\(days)d"
    }

    /// "Ends in 2h" / "Ends in 3d" / "Expired".
    static func expiryLong(_ date: Date, reference: Date = Date()) -> String {
        let interval = date.timeIntervalSince(reference)
        if interval <= 0 { return "Expired" }
        return "Ends in " + expiryShort(date, reference: reference)
    }

    /// "0.4 mi" or "Online".
    static func distance(_ miles: Double, isOnline: Bool) -> String {
        if isOnline { return "Online" }
        if miles < 0.1 { return "Nearby" }
        return String(format: "%.1f mi", miles)
    }

    /// Honest location label for a deal card:
    /// - Online deal → "Online"
    /// - Approximate location → "~ Midtown" (first locationTag titlecased) or "~ nearby"
    /// - Exact location → precise distance e.g. "0.4 mi"
    static func locationLabel(for deal: Deal) -> String {
        if deal.isOnline { return "Online" }
        if deal.isApproximateLocation {
            if let area = deal.locationTags.first, !area.isEmpty {
                return "~ \(area.capitalized)"
            }
            return "~ nearby"
        }
        return distance(deal.distanceMiles, isOnline: false)
    }

    private static let monthDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = .current
        f.setLocalizedDateFormatFromTemplate("MMMd")
        return f
    }()

    /// "Jun 18"
    static func monthDay(_ date: Date) -> String {
        monthDay.string(from: date)
    }
}
