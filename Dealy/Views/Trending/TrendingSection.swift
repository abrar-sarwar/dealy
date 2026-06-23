import SwiftUI

/// Explore section featuring cross-campus trending deals (high-value / urgent),
/// shown regardless of the user's location. Renders nothing when empty.
struct TrendingSection: View {
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
            Image(systemName: "flame.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Theme.primary)
            Text("Trending")
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Spacer()
            NavigationLink {
                TrendingListView()
            } label: {
                Text("See all")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primary)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}
