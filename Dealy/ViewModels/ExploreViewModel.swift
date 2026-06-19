import Foundation

/// Pure section-building for Explore. Operates on in-range, active deals.
struct ExploreSections {
    let base: [Deal]   // already location- and active-filtered

    struct Section: Identifiable {
        let id: String
        let title: String
        let symbol: String
        let deals: [Deal]
    }

    func curated(interests: Set<DealCategory>, campus: Campus, radius: Int) -> [Section] {
        var sections: [Section] = []

        let trending = DealRanker.rank(base, interests: interests, campus: campus, radius: radius)
        add(&sections, "trending", "Trending near you", "flame.fill", Array(trending.prefix(10)))

        add(&sections, "food", "Food near campus", "fork.knife", category(.food))
        add(&sections, "supplies", "Student supplies", "backpack.fill", category(.studentSupplies))
        add(&sections, "tech", "Tech deals", "laptopcomputer", category(.tech))
        add(&sections, "grocery", "Grocery deals", "cart.fill", category(.groceries))
        add(&sections, "entertainment", "Entertainment", "ticket.fill", category(.entertainment))

        // "Recently added" — higher visualSeed = added later (deterministic).
        let recent = base.sorted { $0.visualSeed > $1.visualSeed }
        add(&sections, "recent", "Recently added", "sparkles", Array(recent.prefix(10)))

        let endingSoon = base
            .filter { $0.isEndingSoon() }
            .sorted { $0.expirationDate < $1.expirationDate }
        add(&sections, "ending", "Ending soon", "clock.fill", endingSoon)

        return sections
    }

    private func category(_ c: DealCategory) -> [Deal] {
        base.filter { $0.category == c }
    }

    private func add(_ sections: inout [Section], _ id: String, _ title: String,
                     _ symbol: String, _ deals: [Deal]) {
        guard !deals.isEmpty else { return }
        sections.append(.init(id: id, title: title, symbol: symbol, deals: deals))
    }
}
