import SwiftUI

/// Explore section: a few curated student programs with a "See all" push.
/// Renders nothing when there are no programs, keeping Explore clean.
struct StudentPerksSection: View {
    let deals: [Deal]
    let onSelect: (Deal) -> Void

    var body: some View {
        if !deals.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                header
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(deals.prefix(4)) { deal in
                        DealRowCard(deal: deal) { onSelect(deal) }
                    }
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    private var header: some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: "graduationcap.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Theme.primary)
            Text("Student Perks")
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Spacer()
            NavigationLink {
                StudentPerksListView()
            } label: {
                Text("See all")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primary)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}
