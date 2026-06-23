import SwiftUI

/// Full vertical list of curated student programs, pushed from the Explore
/// "Student Perks" section's "See all". Tapping a row opens the detail sheet.
struct StudentPerksListView: View {
    @Environment(AppState.self) private var app
    @State private var selected: Deal?

    var body: some View {
        ScrollView {
            if app.studentDeals.isEmpty {
                EmptyStateView(
                    symbol: "graduationcap",
                    title: "No student perks yet",
                    message: "We’re curating verified student programs. Check back soon."
                )
                .padding(.top, Spacing.xl)
            } else {
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(app.studentDeals) { deal in
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
        .navigationTitle("Student Perks")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selected) { DealDetailView(deal: $0) }
    }
}
