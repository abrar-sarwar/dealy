import SwiftUI

struct HomeFilterSheet: View {
    @Binding var selectedCategory: DealCategory?
    @Binding var filters: DealFeedFilters
    let onChange: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    sortSection
                    priceSection
                    dealTypeSection

                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Category")
                            .font(.headline)

                        FlexibleWrap(spacing: Spacing.xs) {
                            filterButton(title: "All deals", symbol: "sparkles", category: nil)
                            ForEach(DealCategory.allCases) { category in
                                filterButton(
                                    title: category.displayName,
                                    symbol: category.symbol,
                                    category: category
                                )
                            }
                        }
                    }
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onChange()
                        Haptics.impact(.light)
                        dismiss()
                    }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var sortSection: some View {
        filterCard {
            Text("Sort by")
                .font(.headline)

            FlexibleWrap(spacing: Spacing.xs) {
                ForEach(DealSortOption.allCases) { option in
                    selectionChip(
                        option.title,
                        symbol: option.symbol,
                        selected: filters.sort == option
                    ) {
                        filters.sort = option
                    }
                }
            }
        }
    }

    private var priceSection: some View {
        filterCard {
            HStack {
                Label("Price range", systemImage: "dollarsign")
                    .font(.headline)
                Spacer()
                Text("$\(Int(filters.minPrice)) – $\(Int(filters.maxPrice))")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.primary)
                    .contentTransition(.numericText())
            }

            VStack(spacing: 4) {
                HStack {
                    Text("Minimum").font(.caption).foregroundStyle(Theme.mutedText)
                    Spacer()
                    Text("$\(Int(filters.minPrice))").font(.caption.weight(.bold))
                }
                Slider(
                    value: $filters.minPrice,
                    in: DealFeedFilters.allowedPriceRange,
                    step: 5
                )
                .tint(Theme.primary)
                .onChange(of: filters.minPrice) { _, value in
                    if value > filters.maxPrice { filters.maxPrice = value }
                }

                HStack {
                    Text("Maximum").font(.caption).foregroundStyle(Theme.mutedText)
                    Spacer()
                    Text("$\(Int(filters.maxPrice))").font(.caption.weight(.bold))
                }
                Slider(
                    value: $filters.maxPrice,
                    in: DealFeedFilters.allowedPriceRange,
                    step: 5
                )
                .tint(Theme.primary)
                .onChange(of: filters.maxPrice) { _, value in
                    if value < filters.minPrice { filters.minPrice = value }
                }
            }

            FlexibleWrap(spacing: Spacing.xs) {
                pricePreset("Any price", maximum: 500)
                pricePreset("Under $10", maximum: 10)
                pricePreset("Under $25", maximum: 25)
                pricePreset("Under $50", maximum: 50)
            }
        }
    }

    private var dealTypeSection: some View {
        filterCard {
            Text("Deal type")
                .font(.headline)

            Toggle(isOn: $filters.onlineOnly) {
                Label("Online deals only", systemImage: "globe")
            }
            Toggle(isOn: $filters.endingSoonOnly) {
                Label("Ending soon", systemImage: "clock.badge.exclamationmark")
            }
            Toggle(isOn: $filters.strongDiscountOnly) {
                Label("40% off or more", systemImage: "percent")
            }
        }
        .tint(Theme.primary)
    }

    private func filterButton(
        title: String,
        symbol: String,
        category: DealCategory?
    ) -> some View {
        let selected = selectedCategory == category
        return Button {
            selectedCategory = category
            onChange()
        } label: {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(selected ? .white : Theme.primaryText)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(selected ? Theme.primary : Theme.surface)
                )
                .overlay(
                    Capsule().stroke(selected ? .clear : Theme.separator, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func pricePreset(_ title: String, maximum: Double) -> some View {
        selectionChip(
            title,
            symbol: maximum == 500 ? "infinity" : "tag.fill",
            selected: filters.minPrice == 0 && filters.maxPrice == maximum
        ) {
            filters.applyMaximum(maximum)
        }
    }

    private func selectionChip(
        _ title: String,
        symbol: String,
        selected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(selected ? .white : Theme.primaryText)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 9)
                .background(Capsule().fill(selected ? Theme.primary : Theme.fieldBackground))
        }
        .buttonStyle(.plain)
    }

    private func filterCard<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            content()
        }
        .padding(Spacing.md)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg)
                .stroke(Theme.separator, lineWidth: 1)
        )
    }
}
