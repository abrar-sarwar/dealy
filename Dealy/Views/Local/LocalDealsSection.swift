import SwiftUI

/// Explore section featuring curated local deals within ~15mi (restaurants,
/// cafés, student-discount spots). Curated trust, not Verified. Renders nothing
/// when empty.
struct LocalDealsSection: View {
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
            Image(systemName: "fork.knife")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Theme.primary)
            Text("Local Deals")
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Spacer()
            NavigationLink {
                LocalDealsListView()
            } label: {
                Text("See all")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primary)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}
