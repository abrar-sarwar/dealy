import SwiftUI

/// Card summarizing one recommended store: where to go, the estimated total,
/// savings, distance, and why. Used for both the best single stop and the
/// optional "Worth a second stop?" recommendation.
struct StoreRecommendationCard: View {
    let store: StoreRecommendation
    var onOpenInMaps: (() -> Void)? = nil

    var body: some View {
        DealyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: store.kind == .bestSingle ? "cart.fill" : "mappin.and.ellipse")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.primary)
                    Text(store.kind.displayName)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.mutedText)
                        .textCase(.uppercase)
                    Spacer()
                    if let distance = store.distanceMiles {
                        InfoChip(symbol: "location.fill",
                                 text: String(format: "%.1f mi", distance),
                                 tint: Theme.primary)
                    }
                }

                Text(store.name)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Theme.primaryText)

                HStack(spacing: Spacing.md) {
                    metric(title: "Est. total", value: Format.price(store.estimatedTotal), tint: Theme.primaryText)
                    if store.estimatedSavings > 0 {
                        metric(title: "Est. savings", value: Format.price(store.estimatedSavings), tint: Theme.save)
                    }
                }

                if !store.reason.isEmpty {
                    Text(store.reason)
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let onOpenInMaps {
                    Button(action: onOpenInMaps) {
                        Label("Open in Maps", systemImage: "map.fill")
                    }
                    .buttonStyle(SecondaryButtonStyle(fullWidth: true))
                    .padding(.top, Spacing.xxs)
                }
            }
        }
    }

    private func metric(title: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Theme.mutedText)
            Text(value)
                .font(.headline.weight(.bold))
                .foregroundStyle(tint)
        }
    }
}

#Preview {
    StoreRecommendationCard(
        store: StoreRecommendation(
            name: "Aldi", placeId: nil, kind: .bestSingle, score: 0.82,
            estimatedTotal: 33.80, estimatedSavings: 6.40, distanceMiles: 1.2,
            reason: "Covers 90% of your basket under budget"),
        onOpenInMaps: {}
    )
    .padding()
    .background(Theme.background)
}
