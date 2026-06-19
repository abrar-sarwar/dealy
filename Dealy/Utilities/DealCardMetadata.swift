import Foundation

enum DealCardMetadata {
    static func items(for deal: Deal, reference: Date = Date()) -> [String] {
        let expiry = Format.expiryShort(deal.expirationDate, reference: reference)
        return [
            Format.distance(deal.distanceMiles, isOnline: deal.isOnline),
            deal.category.displayName,
            expiry == "Expired" ? expiry : "\(expiry) left"
        ]
    }
}
