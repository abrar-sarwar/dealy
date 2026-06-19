import SwiftUI

/// Selectable campus/city card used in onboarding and the location selector.
struct CampusRow: View {
    let campus: Campus
    let isSelected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.md) {
                ZStack {
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .fill(Theme.primary.opacity(isSelected ? 0.16 : 0.08))
                        .frame(width: 46, height: 46)
                    Image(systemName: isSelected ? "mappin.circle.fill" : "mappin.circle")
                        .font(.title2)
                        .foregroundStyle(Theme.primary)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(campus.name)
                        .font(.headline)
                        .foregroundStyle(Theme.primaryText)
                    Text("\(campus.cityContext) · \(campus.defaultRadius) mi default")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedText)
                    Text(campus.blurb)
                        .font(.caption)
                        .foregroundStyle(Theme.faintText)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isSelected ? Theme.primary : Theme.separator)
            }
            .padding(Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .fill(Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .stroke(isSelected ? Theme.primary : Theme.separator,
                            lineWidth: isSelected ? 2 : 0.75)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
