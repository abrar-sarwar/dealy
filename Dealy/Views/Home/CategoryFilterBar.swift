import SwiftUI

/// Horizontally scrolling category chips. nil == "All".
struct CategoryFilterBar: View {
    @Binding var selection: DealCategory?
    var onChange: () -> Void = {}

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.xs) {
                    chip(title: "All", symbol: "square.grid.2x2", category: nil)
                    ForEach(DealCategory.allCases) { category in
                        chip(title: category.displayName, symbol: category.symbol, category: category)
                    }
                }
                .padding(.horizontal, Spacing.lg)
            }
            .onChange(of: selection) { _, new in
                withAnimation(.snappy) { proxy.scrollTo(new?.rawValue ?? "all", anchor: .center) }
            }
        }
    }

    private func chip(title: String, symbol: String, category: DealCategory?) -> some View {
        let isSelected = selection == category
        return Button {
            Haptics.selection()
            selection = category
            onChange()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: symbol).font(.caption.weight(.semibold))
                Text(title).font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(isSelected ? .white : Theme.primaryText)
            .padding(.vertical, Spacing.xs)
            .padding(.horizontal, Spacing.sm)
            .background(
                Capsule().fill(isSelected ? AnyShapeStyle(Theme.brandGradient)
                                          : AnyShapeStyle(Theme.surface))
            )
            .overlay(Capsule().stroke(isSelected ? .clear : Theme.separator, lineWidth: 0.75))
        }
        .buttonStyle(.plain)
        .id(category?.rawValue ?? "all")
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
