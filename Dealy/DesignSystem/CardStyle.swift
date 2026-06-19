import SwiftUI

/// Reusable surface card container: continuous rounded corners, subtle border + soft shadow.
struct DealyCard<Content: View>: View {
    var padding: CGFloat = Spacing.md
    var cornerRadius: CGFloat = Radius.lg
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Theme.separator, lineWidth: 0.75)
            )
            .dealyShadow(.soft)
    }
}

extension View {
    /// Apply the standard Dealy surface-card treatment to any view.
    func dealyCardSurface(cornerRadius: CGFloat = Radius.lg) -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Theme.separator, lineWidth: 0.75)
            )
            .dealyShadow(.soft)
    }
}
