import SwiftUI

/// Two-up savings summary. Carefully distinguishes *potential* savings (from
/// currently-saved deals) from *realized* savings (deals marked as used).
struct SavingsSummaryCard: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                metric(
                    label: "Potential savings",
                    value: Format.moneyExact(app.totalPotentialSavings),
                    caption: "Across \(app.savedCount) saved",
                    symbol: "tag.fill",
                    tint: Theme.primary
                )
                metric(
                    label: "Saved this month",
                    value: Format.moneyExact(app.realizedSavings()),
                    caption: "Marked as used",
                    symbol: "checkmark.seal.fill",
                    tint: Theme.save
                )
            }
            Text("Potential savings show what your saved deals could save you — not money already spent or saved.")
                .font(.caption2)
                .foregroundStyle(Theme.faintText)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.md)
        .background(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .fill(Theme.brandGradient.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .stroke(Theme.primary.opacity(0.18), lineWidth: 1)
        )
    }

    private func metric(label: String, value: String, caption: String,
                        symbol: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: symbol).font(.subheadline.weight(.bold)).foregroundStyle(tint)
            Text(value)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.primaryText)
                .contentTransition(.numericText())
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.primaryText)
            Text(caption).font(.caption2).foregroundStyle(Theme.mutedText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.sm)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Theme.surface))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value). \(caption)")
    }
}
