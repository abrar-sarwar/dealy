import Foundation

/// The four inventory classes that compose the Dealy feed. Campus assignment
/// changes only the weighting/presence of `.local`; `.online`, `.national`, and
/// `.trending` are always available to every user regardless of campus state.
///
/// This is the feed-composition contract: location determines local relevance,
/// never access.
enum InventoryClass: String, CaseIterable {
    /// Nearby physical businesses (restaurants, coffee, gyms, …). Layered in when
    /// a usable location exists; boosted when the user is on/near a campus.
    case local
    /// Online deals available to everyone.
    case online
    /// Student-exclusive online programs (e.g. education pricing), available
    /// nationally regardless of campus.
    case national
    /// High-value promotions surfaced across all supported campuses.
    case trending
}

enum InventoryClassifier {
    /// Classify a deal into its inventory class. `.trending` takes precedence (a
    /// high-value cross-campus promotion surfaces everywhere); otherwise online
    /// student-exclusive deals are `.national`, other online deals are `.online`,
    /// and everything else is `.local`.
    static func classify(_ deal: Deal) -> InventoryClass {
        if deal.isTrending { return .trending }
        if deal.isOnline { return deal.isStudentOnly ? .national : .online }
        return .local
    }
}
