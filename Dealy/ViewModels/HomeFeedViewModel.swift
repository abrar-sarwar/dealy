import Foundation
import Observation

/// Owns the live swipe deck for Home. AppState remains the source of truth for
/// persistence (saved/watched/history); this manages deck ordering, removal,
/// and undo re-insertion for the animation.
@Observable
final class HomeFeedViewModel {
    var selectedCategory: DealCategory? = nil
    private(set) var deck: [Deal] = []

    /// Recompute the deck from current app state, excluding already-swiped deals.
    func rebuild(using app: AppState) {
        let active = DealFilter.active(app.allDeals)
        let located = DealFilter.byLocation(active, campus: app.currentCampus, radius: app.radius)
        let categorized = DealFilter.byCategory(located, category: selectedCategory)
        let unseen = categorized.filter { !app.swipedDealIDs.contains($0.id) }
        deck = DealRanker.rank(unseen,
                               interests: app.interests,
                               campus: app.currentCampus,
                               radius: app.radius)
    }

    var topDeal: Deal? { deck.first }

    /// Cards visible in the stack (top first).
    var visibleCards: [Deal] { Array(deck.prefix(3)) }

    /// Remove the top card after it has been committed to AppState.
    func popTop() {
        if !deck.isEmpty { deck.removeFirst() }
    }

    /// Re-insert an undone deal at the top of the deck.
    func reinsertTop(_ deal: Deal) {
        deck.removeAll { $0.id == deal.id }
        deck.insert(deal, at: 0)
    }

    /// Whether the deck is empty because filters hid everything vs. fully swiped.
    func emptyReason(using app: AppState) -> EmptyReason {
        let active = DealFilter.active(app.allDeals)
        let located = DealFilter.byLocation(active, campus: app.currentCampus, radius: app.radius)
        let categorized = DealFilter.byCategory(located, category: selectedCategory)
        if categorized.isEmpty {
            return selectedCategory == nil ? .noneInArea : .filteredOut
        }
        return .allSwiped
    }

    enum EmptyReason {
        case allSwiped, filteredOut, noneInArea
    }
}
