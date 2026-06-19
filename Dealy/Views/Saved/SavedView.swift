import SwiftUI

struct SavedView: View {
    @Environment(AppState.self) private var app
    @Environment(TabRouter.self) private var router
    @State private var filter: DealCategory?
    @State private var selectedDeal: Deal?

    private var savedDeals: [Deal] {
        let all = app.savedDeals
        guard let filter else { return all }
        return all.filter { $0.category == filter }
    }

    private var availableCategories: [DealCategory] {
        var seen = Set<DealCategory>()
        return app.savedDeals.compactMap { deal in
            guard !seen.contains(deal.category) else { return nil }
            seen.insert(deal.category); return deal.category
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if app.savedCount == 0 {
                    EmptyStateView(
                        symbol: "heart.text.square",
                        title: "No saved deals yet",
                        message: "Swipe right on deals you like and they’ll show up here, ready when you are.",
                        primaryTitle: "Find deals",
                        primaryAction: { switchToHome() }
                    )
                } else {
                    list
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Saved")
            .toolbar {
                if !availableCategories.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) { filterMenu }
                }
            }
            .sheet(item: $selectedDeal) { DealDetailView(deal: $0) }
        }
    }

    private var list: some View {
        List {
            Section {
                SavingsSummaryCard()
                    .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.lg,
                                              bottom: Spacing.md, trailing: Spacing.lg))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            Section {
                ForEach(savedDeals) { deal in
                    DealRowCard(deal: deal) { selectedDeal = deal }
                        .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.lg,
                                                  bottom: Spacing.xs, trailing: Spacing.lg))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                remove(deal)
                            } label: { Label("Remove", systemImage: "trash") }
                        }
                        .swipeActions(edge: .leading) {
                            Button {
                                _ = app.toggleWatched(deal.id); Haptics.impact(.light)
                            } label: {
                                Label(app.isWatched(deal.id) ? "Unwatch" : "Watch",
                                      systemImage: app.isWatched(deal.id) ? "bell.slash" : "bell")
                            }
                            .tint(Theme.watch)
                        }
                }
            } header: {
                if let filter {
                    Text("\(filter.displayName) · \(savedDeals.count)")
                } else {
                    Text("\(app.savedCount) saved")
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private var filterMenu: some View {
        Menu {
            Button { filter = nil } label: {
                Label("All categories", systemImage: filter == nil ? "checkmark" : "")
            }
            ForEach(availableCategories) { category in
                Button { filter = category } label: {
                    Label(category.displayName, systemImage: filter == category ? "checkmark" : category.symbol)
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .accessibilityLabel("Filter saved deals")
        }
    }

    private func remove(_ deal: Deal) {
        withAnimation { app.unsave(deal.id) }
        Haptics.impact(.light)
    }

    private func switchToHome() {
        Haptics.selection()
        router.selection = .home
    }
}
