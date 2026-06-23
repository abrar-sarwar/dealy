import SwiftUI

struct FlowChips: View {
    let items: [String]

    var body: some View {
        FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.primary)
                    .padding(.vertical, 5)
                    .padding(.horizontal, Spacing.sm)
                    .background(Capsule().fill(Theme.primary.opacity(0.12)))
            }
        }
    }
}
