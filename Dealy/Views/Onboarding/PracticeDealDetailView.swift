import SwiftUI

struct PracticeDealDetailView: View {
    let deal: Deal
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    CategoryArtwork(category: deal.category, seed: deal.visualSeed, symbolScale: 1.15)
                        .frame(height: 210)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))

                    VStack(alignment: .leading, spacing: 5) {
                        Text(deal.title)
                            .font(.dealyCondensedBlack(size: 34))
                            .foregroundStyle(Theme.primaryText)
                        Text(deal.merchant)
                            .font(.headline)
                            .foregroundStyle(Theme.mutedText)
                    }

                    HStack {
                        PriceView(deal: deal, size: .large)
                        Spacer()
                        SavingsPill(deal: deal)
                    }

                    detailSection(
                        "WHAT YOU GET",
                        deal.detailedDescription
                    )
                    detailSection(
                        "HOW TO USE IT",
                        "Real deals show the merchant link, coupon, directions, and exact redemption steps here."
                    )
                    detailSection(
                        "TERMS",
                        deal.terms
                    )
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Practice details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func detailSection(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title)
                .font(.dealyCondensedBlack(size: 20))
                .foregroundStyle(Theme.primaryText)
            Text(body)
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
                .lineSpacing(3)
        }
    }
}
