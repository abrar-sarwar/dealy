import SwiftUI

/// Chip communicating how confident Dealy is in a generated basket.
struct ConfidenceBadge: View {
    let confidence: BasketConfidence

    private var tint: Color {
        switch confidence {
        case .high: return Theme.save
        case .medium: return Theme.primary
        case .low: return Theme.watch
        }
    }

    var body: some View {
        InfoChip(symbol: confidence.icon, text: confidence.displayName, tint: tint)
            .accessibilityLabel(confidence.displayName)
    }
}

#Preview {
    HStack {
        ConfidenceBadge(confidence: .high)
        ConfidenceBadge(confidence: .medium)
        ConfidenceBadge(confidence: .low)
    }
    .padding()
}
