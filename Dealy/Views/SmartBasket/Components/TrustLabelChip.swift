import SwiftUI

/// Small chip that labels the trust level of a basket item or matched deal.
/// Estimated/sample stay muted; only `verified`/`source_backed` read as trusted.
struct TrustLabelChip: View {
    let label: TrustLabel

    private var tint: Color {
        switch label {
        case .verified: return Theme.save
        case .sourceBacked: return Theme.primary
        case .estimated: return Theme.mutedText
        case .geminiTip: return Theme.watch
        case .manualCurated: return Color(hex: 0x8B5CF6)   // purple
        case .lowConfidence: return Theme.warning
        case .needsVerification: return Theme.warning
        case .userReported: return Theme.mutedText
        case .mock: return Theme.mutedText
        }
    }

    var body: some View {
        InfoChip(symbol: label.icon, text: label.displayName, tint: tint)
            .accessibilityLabel("\(label.displayName) price")
    }
}

#Preview {
    HStack {
        TrustLabelChip(label: .verified)
        TrustLabelChip(label: .estimated)
        TrustLabelChip(label: .sourceBacked)
    }
    .padding()
}
