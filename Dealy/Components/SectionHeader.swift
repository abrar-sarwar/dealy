import SwiftUI

struct SectionHeader: View {
    let title: String
    var symbol: String? = nil

    var body: some View {
        HStack(spacing: Spacing.xs) {
            if let symbol {
                Image(systemName: symbol).font(.subheadline.weight(.bold)).foregroundStyle(Theme.primary)
            }
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Spacer()
        }
        .accessibilityAddTraits(.isHeader)
    }
}
