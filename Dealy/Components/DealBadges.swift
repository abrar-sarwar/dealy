import SwiftUI

/// Small reusable chip with icon + text and a tint.
struct InfoChip: View {
    let symbol: String
    let text: String
    var tint: Color = Theme.primary
    var filled: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).font(.caption2.weight(.bold))
            Text(text).font(.caption.weight(.semibold))
        }
        .foregroundStyle(filled ? .white : tint)
        .padding(.vertical, 5)
        .padding(.horizontal, Spacing.xs)
        .background(
            Capsule().fill(filled ? AnyShapeStyle(tint) : AnyShapeStyle(tint.opacity(0.14)))
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// Deal score badge with an explainer affordance handled by the parent.
struct DealScoreBadge: View {
    let score: Int
    var compact: Bool = false

    private var tint: Color {
        switch score {
        case 90...: return Theme.save
        case 75..<90: return Theme.primary
        default: return Theme.mutedText
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "bolt.fill").font(.caption2.weight(.bold))
            if !compact { Text("Deal Score").font(.caption2.weight(.semibold)) }
            Text("\(score)").font(.caption.weight(.bold))
        }
        .foregroundStyle(.white)
        .padding(.vertical, 5)
        .padding(.horizontal, Spacing.xs)
        .background(Capsule().fill(tint))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Deal score \(score) out of 100")
    }
}

/// Expiry chip that turns urgent when ending soon / expired.
struct ExpiryChip: View {
    let date: Date
    var reference: Date = Date()

    private var expired: Bool { date <= reference }
    private var endingSoon: Bool {
        let i = date.timeIntervalSince(reference)
        return i > 0 && i <= 60 * 60 * 12
    }
    private var tint: Color { expired ? Theme.mutedText : (endingSoon ? Theme.warning : Theme.mutedText) }

    var body: some View {
        InfoChip(symbol: expired ? "xmark.circle" : "clock",
                 text: Format.expiryLong(date, reference: reference),
                 tint: tint,
                 filled: endingSoon)
    }
}
