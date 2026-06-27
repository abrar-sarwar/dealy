import SwiftUI

/// Entry point card for the Food Run flow. A prominent gradient hero and a slim
/// compact banner, mirroring `SmartBasketEntryCard`. Tapping opens the setup quiz.
struct FoodRunEntryCard: View {
    var compact: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if compact { compactBody } else { heroBody }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Food Run. Find the best place to eat right now.")
        .accessibilityAddTraits(.isButton)
    }

    private var compactBody: some View {
        HStack(spacing: Spacing.sm) {
            icon(size: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text("Food Run")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                Text("Where should I eat right now?")
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
                .fill(gradient)
        )
        .dealyShadow(.soft)
    }

    private var heroBody: some View {
        HStack(spacing: Spacing.md) {
            icon(size: 52)
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text("Food Run")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                Text("Hungry and on a budget? Dealy picks the spot and tells you what to order.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
                Text("Find food")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.save)
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
                .fill(gradient)
        )
        .dealyShadow(.card)
    }

    private var gradient: LinearGradient {
        LinearGradient(
            colors: [Theme.save, Theme.saveSoft],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private func icon(size: CGFloat) -> some View {
        ZStack {
            Circle().fill(.white.opacity(0.18)).frame(width: size, height: size)
            Image(systemName: "fork.knife")
                .font(.system(size: size * 0.45, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

/// A lightweight one-tap "decision card" that deep-links Food Run to a preset
/// goal ("Best lunch move today" → quickLunch, "Under $10 near you" → under10).
struct FoodRunDecisionCard: View {
    let title: String
    let subtitle: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.sm) {
                ZStack {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .fill(Theme.primary.opacity(0.12))
                        .frame(width: 44, height: 44)
                    Image(systemName: symbol)
                        .font(.headline)
                        .foregroundStyle(Theme.primary)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Theme.mutedText)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.faintText)
            }
            .padding(Spacing.sm)
            .dealyCardSurface(cornerRadius: Radius.md)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(subtitle)")
        .accessibilityAddTraits(.isButton)
    }
}

#Preview {
    VStack(spacing: Spacing.lg) {
        FoodRunEntryCard {}
        FoodRunEntryCard(compact: true) {}
        FoodRunDecisionCard(title: "Best lunch move today",
                            subtitle: "Quick, close, on budget",
                            symbol: "bolt.fill") {}
    }
    .padding()
    .background(Theme.background)
}
