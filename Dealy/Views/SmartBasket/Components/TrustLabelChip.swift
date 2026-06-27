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
        case .userReported: return Theme.watch
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
