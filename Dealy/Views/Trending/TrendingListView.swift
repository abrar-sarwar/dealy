import SwiftUI

/// Full list of cross-campus trending deals, pushed from the Explore "Trending"
/// section's "See all". Distance is shown honestly by DealRowCard — these are
/// discovery, not necessarily near the user.
struct TrendingListView: View {
    @Environment(AppState.self) private var app
    @State private var selected: Deal?

    var body: some View {
        ScrollView {
            if app.trendingDeals.isEmpty {
                EmptyStateView(
                    symbol: "flame",
                    title: "Nothing trending yet",
                    message: "Exceptional campus deals will show up here as they appear."
                )
                .padding(.top, Spacing.xl)
            } else {
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(app.trendingDeals) { deal in
                        DealRowCard(deal: deal) {
                            app.recordOpened(deal.id)
                            selected = deal
                        }
                    }
                }
                .padding(Spacing.lg)
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Trending")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selected) { DealDetailView(deal: $0) }
    }
}
