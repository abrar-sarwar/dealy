import SwiftUI

/// Full list of curated local deals within ~15mi, pushed from the Explore
/// "Local Deals" section's "See all". Distance shown by DealRowCard.
struct LocalDealsListView: View {
    @Environment(AppState.self) private var app
    @State private var selected: Deal?

    var body: some View {
        ScrollView {
            if app.localDeals.isEmpty {
                EmptyStateView(
                    symbol: "fork.knife",
                    title: "No local deals nearby yet",
                    message: "We’re curating restaurants, cafés, and student spots around you. Check back soon."
                )
                .padding(.top, Spacing.xl)
            } else {
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(app.localDeals) { deal in
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
        .navigationTitle("Local Deals")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selected) { DealDetailView(deal: $0) }
    }
}
