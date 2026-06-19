import SwiftUI

struct SwipeCardView: View {
    let deal: Deal
    let campus: Campus
    var dragTranslation: CGSize = .zero

    private var horizontalProgress: Double {
        Double(max(min(dragTranslation.width / 110, 1), -1))
    }

    private var upwardProgress: Double {
        Double(max(min(-dragTranslation.height / 90, 1), 0))
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            CategoryArtwork(category: deal.category, seed: deal.visualSeed, symbolScale: 1.8)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()

            LinearGradient(
                colors: [.clear, .black.opacity(0.08), .black.opacity(0.84)],
                startPoint: .top,
                endPoint: .bottom
            )

            dealDetails
        }
        .background(deal.category.gradient)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(.white.opacity(0.24), lineWidth: 1)
        )
        .overlay(edgeFeedback)
        .shadow(color: .black.opacity(0.15), radius: 22, y: 10)
    }

    private var dealDetails: some View {
        VStack(alignment: .leading, spacing: 12) {
            metadataRail

            HStack(alignment: .bottom, spacing: Spacing.sm) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(deal.title)
                        .font(.system(size: 25, weight: .bold, design: .rounded))
                        .lineLimit(2)
                    Text(deal.merchant)
                        .font(.subheadline.weight(.medium))
                        .opacity(0.82)
                }

                Spacer(minLength: Spacing.sm)

                VStack(alignment: .trailing, spacing: 3) {
                    Text(Format.price(deal.currentPrice))
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                    if deal.savingsPercentage > 0 {
                        Text("\(deal.savingsPercentage)% off")
                            .font(.caption.weight(.semibold))
                            .opacity(0.82)
                    }
                }
            }
        }
        .foregroundStyle(.white)
        .padding(Spacing.lg)
    }

    private var metadataRail: some View {
        HStack(spacing: 8) {
            ForEach(Array(DealCardMetadata.items(for: deal).enumerated()), id: \.offset) { index, item in
                if index > 0 {
                    Circle().fill(.white.opacity(0.56)).frame(width: 3, height: 3)
                }
                Text(item)
                    .lineLimit(1)
            }
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
        .fixedSize(horizontal: true, vertical: false)
    }

    private var edgeFeedback: some View {
        ZStack {
            edgeGlow(color: Theme.skip, alignment: .leading)
                .opacity(max(-horizontalProgress, 0))
            edgeGlow(color: Theme.save, alignment: .trailing)
                .opacity(max(horizontalProgress, 0))
            bottomGlow
                .opacity(upwardProgress)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func edgeGlow(color: Color, alignment: Alignment) -> some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: alignment == .leading
                        ? [color.opacity(0.9), color.opacity(0)]
                        : [color.opacity(0), color.opacity(0.9)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(width: 86)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .blur(radius: 12)
    }

    private var bottomGlow: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [.clear, Theme.primary.opacity(0.95)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(height: 100)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .blur(radius: 12)
    }
}
