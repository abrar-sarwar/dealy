import SwiftUI

/// A single deal card in the swipe deck. Presentational: drag/overlay state is
/// driven by `dragTranslation` (non-zero only for the top, draggable card).
struct SwipeCardView: View {
    let deal: Deal
    let campus: Campus
    var dragTranslation: CGSize = .zero

    private var swipeProgress: Double {
        Double(max(min(dragTranslation.width / 120, 1), -1))
    }
    private var nearCampus: Bool {
        !deal.isOnline && !Set(deal.locationTags).isDisjoint(with: Set(campus.locationTags))
    }

    var body: some View {
        VStack(spacing: 0) {
            artwork
            info
        }
        .background(
            RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).fill(Theme.surface)
        )
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
                .stroke(Theme.separator, lineWidth: 0.75)
        )
        .dealyShadow(.card)
        .overlay(stamps)
    }

    private var artwork: some View {
        ZStack(alignment: .top) {
            CategoryArtwork(category: deal.category, seed: deal.visualSeed, symbolScale: 1.15)
                .frame(height: 196)
            HStack {
                InfoChip(symbol: deal.category.symbol, text: deal.category.displayName,
                         tint: .white)
                    .background(.ultraThinMaterial, in: Capsule())
                Spacer()
                DealScoreBadge(score: deal.dealScore)
            }
            .padding(Spacing.sm)
        }
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(deal.title)
                    .font(.system(.title2, design: .rounded, weight: .bold))
                    .foregroundStyle(Theme.primaryText)
                    .lineLimit(2)
                Text(deal.merchant)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.mutedText)
            }

            HStack(alignment: .firstTextBaseline) {
                PriceView(deal: deal)
                Spacer()
                SavingsPill(deal: deal)
            }

            HStack(spacing: Spacing.xs) {
                InfoChip(symbol: deal.isOnline ? "globe" : "location.fill",
                         text: Format.distance(deal.distanceMiles, isOnline: deal.isOnline),
                         tint: Theme.primary)
                ExpiryChip(date: deal.expirationDate)
            }

            if nearCampus {
                Text("Near \(campus.shortName)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.mutedText)
            } else if deal.isOnline {
                Text("Ships anywhere")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.mutedText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
    }

    /// SAVE / SKIP stamps revealed as the card is dragged.
    private var stamps: some View {
        ZStack {
            stamp(text: "SAVE", color: Theme.save, rotation: -16)
                .opacity(max(swipeProgress, 0))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            stamp(text: "SKIP", color: Theme.skip, rotation: 16)
                .opacity(max(-swipeProgress, 0))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        }
        .padding(Spacing.lg)
    }

    private func stamp(text: String, color: Color, rotation: Double) -> some View {
        Text(text)
            .font(.system(size: 34, weight: .heavy, design: .rounded))
            .foregroundStyle(color)
            .padding(.vertical, 6)
            .padding(.horizontal, Spacing.sm)
            .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                .stroke(color, lineWidth: 4))
            .rotationEffect(.degrees(rotation))
            .accessibilityHidden(true)
    }
}
