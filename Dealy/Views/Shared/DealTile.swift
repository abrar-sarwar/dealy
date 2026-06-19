import SwiftUI

/// Compact deal tile for horizontal carousels in Explore.
struct DealTile: View {
    let deal: Deal
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .topTrailing) {
                    CategoryArtwork(category: deal.category, seed: deal.visualSeed)
                        .frame(height: 104)
                    SavingsPill(deal: deal)
                        .padding(Spacing.xs)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(deal.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(2, reservesSpace: true)
                        .multilineTextAlignment(.leading)
                    Text(deal.merchant)
                        .font(.caption)
                        .foregroundStyle(Theme.mutedText)
                        .lineLimit(1)
                    HStack(spacing: Spacing.xs) {
                        if deal.hasFixedPricing {
                            Text(Format.price(deal.currentPrice))
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(Theme.primaryText)
                        }
                        Spacer(minLength: 0)
                        Text(Format.distance(deal.distanceMiles, isOnline: deal.isOnline))
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(Theme.mutedText)
                    }
                }
                .padding(Spacing.sm)
            }
            .frame(width: 180)
            .background(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).fill(Theme.surface)
            )
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .stroke(Theme.separator, lineWidth: 0.75)
            )
            .dealyShadow(.soft)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens deal details")
    }
}
