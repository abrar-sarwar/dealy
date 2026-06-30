import SwiftUI

/// One row in a generated basket: name, quantity/unit, price, trust chip, and a
/// matched-deal hint. Remove / swap actions are surfaced via a trailing menu so
/// the row stays tappable and uncluttered.
struct BasketItemRow: View {
    let item: BasketItem
    var onRemove: (() -> Void)? = nil
    var onSwap: ((String) -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)

                HStack(spacing: Spacing.xs) {
                    Text(quantityText)
                        .font(.caption)
                        .foregroundStyle(Theme.mutedText)
                    TrustLabelChip(label: item.trustLabel)
                    if item.hasMatchedDeal {
                        InfoChip(symbol: "tag.fill", text: "Deal matched", tint: Theme.save, filled: true)
                    }
                }
            }

            Spacer(minLength: Spacing.xs)

            Text(Format.price(item.lineTotal))
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(Theme.primaryText)

            if onRemove != nil || (onSwap != nil && !item.substitutionOptions.isEmpty) {
                Menu {
                    if let onSwap, !item.substitutionOptions.isEmpty {
                        ForEach(item.substitutionOptions, id: \.self) { sub in
                            Button {
                                onSwap(sub)
                            } label: {
                                Label("Swap for \(sub)", systemImage: "arrow.triangle.2.circlepath")
                            }
                        }
                    }
                    if let onRemove {
                        Button(role: .destructive, action: onRemove) {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.body)
                        .foregroundStyle(Theme.mutedText)
                }
                .accessibilityLabel("Edit \(item.name)")
            }
        }
        .padding(.vertical, Spacing.xs)
    }

    private var quantityText: String {
        let unit = item.unit.isEmpty ? "" : " \(item.unit)"
        let store = item.store.map { " · \($0)" } ?? ""
        return "\(item.quantity)\(unit)\(store)"
    }
}

#Preview {
    VStack(spacing: 0) {
        BasketItemRow(
            item: BasketItem(name: "Eggs (dozen)", category: "protein",
                             estimatedPrice: 2.49, quantity: 1, unit: "dozen",
                             store: "Aldi", matchedDealId: nil, confidence: .medium,
                             trustLabel: .estimated, substitutionOptions: ["Egg whites"]),
            onRemove: {}, onSwap: { _ in })
    }
    .padding()
    .background(Theme.background)
}
