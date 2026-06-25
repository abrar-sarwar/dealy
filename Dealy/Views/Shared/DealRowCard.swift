import SwiftUI

/// Full-width deal row used in lists (Saved, search results). Tapping opens detail.
struct DealRowCard: View {
    let deal: Deal
    var onTap: () -> Void

    @Environment(AppState.self) private var app

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Spacing.sm) {
                DealImage(deal: deal)
                    .frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(deal.title)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(1)
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
                        if deal.savingsAmount > 0 {
                            Text("Save \(Format.moneyWhole(deal.savingsAmount))")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Theme.save)
                        }
                    }
                    HStack(spacing: Spacing.xs) {
                        InfoChip(symbol: deal.isOnline ? "globe" : "location.fill",
                                 text: Format.locationLabel(for: deal),
                                 tint: Theme.mutedText)
                        if deal.isEndingSoon() {
                            InfoChip(symbol: "clock", text: Format.expiryShort(deal.expirationDate),
                                     tint: Theme.warning, filled: true)
                        }
                        if deal.requiresStudentId { StudentIDBadge() }
                        if let campus = deal.campusBadge { CampusBadge(label: campus) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Theme.faintText)
            }
            .padding(Spacing.sm)
            .dealyCardSurface(cornerRadius: Radius.lg)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens deal details")
    }
}
