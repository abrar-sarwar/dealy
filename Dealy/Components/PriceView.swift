import SwiftUI

/// Price block: current price, struck original, and a savings call-out.
/// Gracefully handles deals without fixed pricing (e.g. "extra 20% off").
struct PriceView: View {
    let deal: Deal
    var size: Size = .regular

    enum Size { case regular, large }

    private var currentFont: Font {
        size == .large ? .system(size: 34, weight: .bold, design: .rounded)
                       : .system(.title3, design: .rounded, weight: .bold)
    }

    var body: some View {
        if deal.hasFixedPricing {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                Text(Format.price(deal.currentPrice))
                    .font(currentFont)
                    .foregroundStyle(Theme.primaryText)
                Text("Was \(Format.price(deal.originalPrice))")
                    .font(.footnote)
                    .strikethrough()
                    .foregroundStyle(Theme.mutedText)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Now \(Format.price(deal.currentPrice)), was \(Format.price(deal.originalPrice))")
        } else {
            Text(deal.shortDescription)
                .font(size == .large ? .title3.weight(.semibold) : .headline)
                .foregroundStyle(Theme.primaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Pill summarizing the savings on a deal ("Save $6" or "20% off").
struct SavingsPill: View {
    let deal: Deal
    var body: some View {
        Group {
            if deal.savingsAmount > 0 {
                InfoChip(symbol: "tag.fill",
                         text: "Save \(Format.moneyWhole(deal.savingsAmount)) · \(deal.savingsPercentage)%",
                         tint: Theme.save, filled: true)
            } else {
                InfoChip(symbol: "tag.fill", text: "Deal", tint: Theme.save, filled: true)
            }
        }
    }
}
