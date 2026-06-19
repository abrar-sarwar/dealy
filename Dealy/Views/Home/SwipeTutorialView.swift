import SwiftUI

struct SwipeTutorialView: View {
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.42)
                .ignoresSafeArea()

            VStack(spacing: Spacing.lg) {
                VStack(spacing: 5) {
                    Text("Deals move with you")
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .foregroundStyle(Theme.primaryText)
                    Text("Three swipes. That’s the whole game.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedText)
                }

                HStack(alignment: .top, spacing: Spacing.md) {
                    gesture(
                        symbol: "arrow.left",
                        title: "BYE",
                        detail: "Not this one",
                        tint: Theme.skip
                    )
                    gesture(
                        symbol: "arrow.up",
                        title: "GET DEAL",
                        detail: "Use the offer",
                        tint: Theme.primary
                    )
                    gesture(
                        symbol: "arrow.right",
                        title: "SAVE",
                        detail: "Keep it",
                        tint: Theme.save
                    )
                }

                Button("Start swiping") {
                    onDismiss()
                }
                .buttonStyle(.primaryDealy)
            }
            .padding(Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
                    .fill(Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
                    .stroke(Theme.separator, lineWidth: 0.75)
            )
            .dealyShadow(.card)
            .padding(Spacing.lg)
        }
        .accessibilityElement(children: .contain)
    }

    private func gesture(
        symbol: String,
        title: String,
        detail: String,
        tint: Color
    ) -> some View {
        VStack(spacing: Spacing.xs) {
            Image(systemName: symbol)
                .font(.system(size: 25, weight: .heavy))
                .foregroundStyle(tint)
                .frame(width: 54, height: 54)
                .background(Circle().fill(tint.opacity(0.12)))

            Text(title)
                .font(.caption.weight(.heavy))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Text(detail)
                .font(.caption2)
                .foregroundStyle(Theme.mutedText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
    }
}
