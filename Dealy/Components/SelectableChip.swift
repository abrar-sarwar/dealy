import SwiftUI

/// Capsule selection chip used across the Smart Basket quiz. Selected = filled
/// `Theme.primary`; unselected = a soft `Theme.primary.opacity(0.12)` tint.
struct SelectableChip: View {
    let title: String
    var systemImage: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage).font(.caption.weight(.bold))
                }
                Text(title).font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(isSelected ? .white : Theme.primary)
            .padding(.vertical, Spacing.xs)
            .padding(.horizontal, Spacing.md)
            .background(
                Capsule().fill(isSelected
                    ? AnyShapeStyle(Theme.primary)
                    : AnyShapeStyle(Theme.primary.opacity(0.12)))
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

#Preview {
    VStack(spacing: Spacing.md) {
        SelectableChip(title: "High protein", systemImage: "dumbbell.fill", isSelected: true) {}
        SelectableChip(title: "Cheapest", systemImage: "dollarsign.circle.fill", isSelected: false) {}
    }
    .padding()
}
