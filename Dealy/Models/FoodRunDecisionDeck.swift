import Foundation

/// One Food Run "decision card" preset: a one-tap shortcut that deep-links the
/// Food Run flow straight to a goal ("Best lunch move today" → `.quickLunch`).
struct FoodRunDecisionCardSpec: Identifiable, Equatable, Sendable {
    let title: String
    let subtitle: String
    let symbol: String
    let goal: FoodRunIntent

    /// Title is the stable identity — two presets may share a goal (e.g. a lunch
    /// card and a "quick bite" card both map to `.quickLunch`) but never a title.
    var id: String { title }
}

/// The Food Run decision-card deck shown on Home / Explore. Pure + testable: the
/// late-night card is time-gated (only surfaced at/after 8pm local) via
/// `visibleCards(hour:)` so the gating logic carries no view dependencies.
enum FoodRunDecisionDeck {
    /// Local hour (0–23) at/after which the late-night card appears.
    static let lateNightHour = 20

    /// All decision cards in display order (before time-gating).
    static let all: [FoodRunDecisionCardSpec] = [
        FoodRunDecisionCardSpec(title: "Best lunch move today",
                                subtitle: "Quick, close, on budget",
                                symbol: "bolt.fill", goal: .quickLunch),
        FoodRunDecisionCardSpec(title: "Under $10 near you",
                                subtitle: "Most food per dollar",
                                symbol: "dollarsign.circle.fill", goal: .under10),
        FoodRunDecisionCardSpec(title: "Best study spot nearby",
                                subtitle: "Comfy, quiet, good Wi-Fi",
                                symbol: "book.fill", goal: .studySpot),
        FoodRunDecisionCardSpec(title: "Quick bite near campus",
                                subtitle: "In and out, fast",
                                symbol: "fork.knife", goal: .quickLunch),
        FoodRunDecisionCardSpec(title: "Worth the walk",
                                subtitle: "Best value a little farther",
                                symbol: "star.circle.fill", goal: .bestValue),
        FoodRunDecisionCardSpec(title: "Late-night move",
                                subtitle: "Open late near you",
                                symbol: "moon.stars.fill", goal: .lateNight),
    ]

    /// The cards to show for a given local `hour` (0–23). The late-night card is
    /// only included when `hour >= lateNightHour` (8pm); all others always show.
    static func visibleCards(hour: Int) -> [FoodRunDecisionCardSpec] {
        all.filter { $0.goal != .lateNight || hour >= lateNightHour }
    }

    /// Convenience for views: the visible cards for the current local hour.
    static func visibleCardsNow(_ date: Date = Date(),
                                calendar: Calendar = .current) -> [FoodRunDecisionCardSpec] {
        visibleCards(hour: calendar.component(.hour, from: date))
    }
}
