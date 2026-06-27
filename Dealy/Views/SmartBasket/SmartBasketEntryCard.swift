import SwiftUI

/// Entry point card for the Smart Basket flow. A prominent gradient hero on
/// Explore and a slim banner at the top of Home. Tapping opens the setup quiz.
struct SmartBasketEntryCard: View {
    var compact: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if compact { compactBody } else { heroBody }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Smart Basket. Build a grocery run for your budget.")
        .accessibilityAddTraits(.isButton)
    }

    private var compactBody: some View {
        HStack(spacing: Spacing.sm) {
            icon(size: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text("Smart Basket")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                Text("Build a grocery run for your budget")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white.opacity(0.9))
        }
        .padding(.vertical, Spacing.sm)
        .padding(.horizontal, Spacing.md)
        .background(
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .fill(Theme.brandGradient)
        )
        .dealyShadow(.soft)
    }

    private var heroBody: some View {
        HStack(spacing: Spacing.md) {
            icon(size: 52)
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text("Smart Basket")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                Text("Tell Dealy your budget and we'll build the list, find deals, and tell you where to go.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
                Text("Build my basket")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.primary)
                    .padding(.vertical, 6)
                    .padding(.horizontal, Spacing.sm)
                    .background(Capsule().fill(.white))
                    .padding(.top, Spacing.xxs)
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .fill(Theme.brandGradient)
        )
        .dealyShadow(.card)
    }

    private func icon(size: CGFloat) -> some View {
        ZStack {
            Circle().fill(.white.opacity(0.18)).frame(width: size, height: size)
            Image(systemName: "cart.fill.badge.plus")
                .font(.system(size: size * 0.45, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

#Preview {
    VStack(spacing: Spacing.lg) {
        SmartBasketEntryCard {}
        SmartBasketEntryCard(compact: true) {}
    }
    .padding()
    .background(Theme.background)
}
