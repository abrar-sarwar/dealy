import Foundation

/// A realized (mock) redemption — used to track money the user actually "saved".
/// Keyed by deal so the same deal can never be double-counted.
struct SavingsEvent: Identifiable, Codable, Hashable {
    let id: UUID
    let dealID: String
    let dealTitle: String
    let amount: Decimal
    let date: Date

    init(dealID: String, dealTitle: String, amount: Decimal, date: Date = Date()) {
        self.id = UUID()
        self.dealID = dealID
        self.dealTitle = dealTitle
        self.amount = amount
        self.date = date
    }
}
