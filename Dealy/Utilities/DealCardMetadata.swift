import Foundation

enum DealCardMetadata {
    static func items(for deal: Deal, reference: Date = Date()) -> [String] {
        let expiry = Format.expiryShort(deal.expirationDate, reference: reference)
        return [
            Format.locationLabel(for: deal),
            deal.category.displayName,
            expiry == "Expired" ? expiry : "\(expiry) left"
        ]
    }
}
