import SwiftUI

/// Explore section showing recently-expired local deals (last 7 days).
/// Cards are visibly dimmed with an "Expired" badge. Tapping does NOT open a
/// redeemable detail — expired deals are never redeemable (`isRedeemable == false`).
/// A CTA routes the user to active local deals via the Home tab.
struct MissedDealsSection: View {
    let deals: [Deal]

    @Environment(TabRouter.self) private var router

    var body: some View {
        if !deals.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                header
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(deals.prefix(5)) { deal in
                        MissedDealRow(deal: deal)
                    }
                }
                ctaButton
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: "clock.badge.xmark")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Theme.mutedText)
            Text("You missed out on some amazing deals")
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Spacer()
        }
        .accessibilityAddTraits(.isHeader)
    }

    // MARK: CTA

    private var ctaButton: some View {
        Button {
            router.selection = .home
        } label: {
            HStack {
                Spacer()
                Text("See deals available now")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primary)
                Image(systemName: "arrow.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primary)
                Spacer()
            }
            .padding(.vertical, Spacing.sm)
            .background(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .fill(Theme.primary.opacity(0.10))
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("See deals available now")
        .accessibilityHint("Switches to the Home tab to browse active deals")
    }
}

// MARK: - MissedDealRow

/// A single expired deal row — visibly dimmed, with an Expired badge, and
/// explicitly non-interactive (no tap action, no redemption path).
private struct MissedDealRow: View {
    let deal: Deal

    var body: some View {
        HStack(spacing: Spacing.sm) {
            DealImage(deal: deal)
                .frame(width: 92, height: 92)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay(
                    // Grey scrim to reinforce expired state
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .fill(Color.black.opacity(0.30))
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(deal.title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText.opacity(0.55))
                    .lineLimit(1)
                Text(deal.merchant)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedText.opacity(0.55))
                    .lineLimit(1)
                if deal.savingsAmount > 0 {
                    Text("Was \(Format.moneyWhole(deal.savingsAmount)) off")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.mutedText.opacity(0.55))
                }
                // Expired badge — red/grey pill, no clock urgency
                InfoChip(symbol: "xmark.circle", text: "Expired", tint: .gray)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.sm)
        .dealyCardSurface(cornerRadius: Radius.lg)
        .opacity(0.70)
        // Non-interactive: no button wrapping, no tap target
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(deal.title) at \(deal.merchant) — expired")
    }
}
