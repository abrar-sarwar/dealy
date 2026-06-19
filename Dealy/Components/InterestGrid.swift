import SwiftUI

/// Toggleable grid of category interests bound to a selection set.
struct InterestGrid: View {
    @Binding var selection: Set<DealCategory>

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: Spacing.sm)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: Spacing.sm) {
            ForEach(DealCategory.allCases) { category in
                InterestChip(category: category, isOn: selection.contains(category)) {
                    toggle(category)
                }
            }
        }
    }

    private func toggle(_ category: DealCategory) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            if selection.contains(category) { selection.remove(category) }
            else { selection.insert(category) }
        }
    }
}

struct InterestChip: View {
    let category: DealCategory
    let isOn: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: category.symbol)
                    .font(.subheadline.weight(.semibold))
                Text(category.displayName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: isOn ? "checkmark.circle.fill" : "plus.circle")
                    .font(.subheadline)
            }
            .foregroundStyle(isOn ? .white : Theme.primaryText)
            .padding(.vertical, Spacing.sm)
            .padding(.horizontal, Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                    .fill(isOn ? AnyShapeStyle(category.gradient) : AnyShapeStyle(Theme.surface))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                    .stroke(isOn ? .clear : Theme.separator, lineWidth: 0.75)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(category.displayName)
        .accessibilityValue(isOn ? "Selected" : "Not selected")
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }
}
