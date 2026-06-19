import Foundation

enum SwipeDirection: String, Codable {
    case left   // skip
    case right  // save

    var isSave: Bool { self == .right }
}

/// Records a single swipe so it can be undone and reasoned about.
struct SwipeAction: Identifiable, Codable, Hashable {
    let id: UUID
    let dealID: String
    let direction: SwipeDirection
    /// Whether the deal was already saved before this action (for accurate undo).
    let wasSavedBefore: Bool
    let date: Date

    init(dealID: String, direction: SwipeDirection, wasSavedBefore: Bool, date: Date = Date()) {
        self.id = UUID()
        self.dealID = dealID
        self.direction = direction
        self.wasSavedBefore = wasSavedBefore
        self.date = date
    }
}
