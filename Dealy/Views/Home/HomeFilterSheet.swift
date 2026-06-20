import SwiftUI

struct HomeFilterSheet: View {
    @Binding var selectedCategory: DealCategory?
    @Binding var filters: DealFeedFilters
    let onChange: () -> Void

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    // Inline location editing state.
    @State private var radius = DiscoveryPreference.defaultRadius
    @State private var isLocating = false
    @State private var locationError: String?

    // Sort options surfaced here (4).
    private let sortOptions: [DealSortOption] = [.recommended, .mostPopular, .lowestPrice, .biggestDiscount]

    private var radiusBinding: Binding<Int> {
        Binding(get: { radius }, set: { radius = $0 })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    locationSection
                    sortSection
                    priceSection
                    categoriesSection
                    salesSection
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { applyAndDismiss() }.fontWeight(.semibold)
                }
            }
            .onAppear { radius = app.discovery.radiusMiles }
        }
        .presentationDetents([.large])
    }

    // MARK: Location (inline, first)

    private var locationSection: some View {
        filterCard {
            Text("Location").font(.headline)

            Button { useCurrentLocation() } label: {
                HStack(spacing: Spacing.sm) {
                    if isLocating { ProgressView() } else {
                        Image(systemName: "location.fill").foregroundStyle(.white)
                    }
                    Text("Use my current location")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                    Spacer()
                }
                .padding(.vertical, 12)
                .padding(.horizontal, Spacing.md)
                .frame(maxWidth: .infinity)
                .background(Theme.primary, in: RoundedRectangle(cornerRadius: Radius.md))
            }
            .buttonStyle(.plain)
            .disabled(isLocating)

            Text(currentLocationLabel)
                .font(.caption).foregroundStyle(Theme.mutedText)

            if let locationError {
                Text(locationError).font(.caption).foregroundStyle(Theme.mutedText)
            }

            Divider()
            RadiusControl(radius: radiusBinding)

            Divider()
            Toggle(isOn: $filters.includeOnline) {
                Label("Include online deals", systemImage: "globe")
            }
            .tint(Theme.primary)
        }
    }

    private var currentLocationLabel: String {
        "Showing deals near \(app.discovery.center.displayName)"
    }

    // MARK: Sort (2×2 grid)

    private var sortSection: some View {
        filterCard {
            Text("Sort").font(.headline)
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: Spacing.xs),
                          GridItem(.flexible(), spacing: Spacing.xs)],
                spacing: Spacing.xs
            ) {
                ForEach(sortOptions) { option in
                    sortChip(option)
                }
            }
        }
    }

    private func sortChip(_ option: DealSortOption) -> some View {
        let selected = filters.sort == option
        return Button { filters.sort = option } label: {
            Label(option.title, systemImage: option.symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(selected ? .white : Theme.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(Capsule().fill(selected ? Theme.primary : Theme.fieldBackground))
        }
        .buttonStyle(.plain)
    }

    // MARK: Price (single slider)

    private var priceSection: some View {
        filterCard {
            HStack {
                Label("Price", systemImage: "dollarsign").font(.headline)
                Spacer()
                Text(filters.maxPrice >= DealFeedFilters.allowedPriceRange.upperBound
                     ? "Any price" : "Up to $\(Int(filters.maxPrice))")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.primary)
                    .contentTransition(.numericText())
            }
            Slider(
                value: Binding(
                    get: { filters.maxPrice },
                    set: { filters.minPrice = 0; filters.maxPrice = $0 }
                ),
                in: DealFeedFilters.allowedPriceRange,
                step: 5
            )
            .tint(Theme.primary)
            FlexibleWrap(spacing: Spacing.xs) {
                pricePreset("Any price", maximum: 500)
                pricePreset("Under $10", maximum: 10)
                pricePreset("Under $25", maximum: 25)
                pricePreset("Under $50", maximum: 50)
            }
        }
    }

    // MARK: Categories

    private var categoriesSection: some View {
        filterCard {
            Text("Categories").font(.headline)
            FlexibleWrap(spacing: Spacing.xs) {
                filterButton(title: "All deals", symbol: "sparkles", category: nil)
                ForEach(DealCategory.allCases) { category in
                    filterButton(title: category.displayName, symbol: category.symbol, category: category)
                }
            }
        }
    }

    // MARK: Sales (deal type)

    private var salesSection: some View {
        filterCard {
            Text("Sales").font(.headline)
            Toggle(isOn: $filters.endingSoonOnly) {
                Label("Ending soon", systemImage: "clock.badge.exclamationmark")
            }
            Toggle(isOn: $filters.strongDiscountOnly) {
                Label("40% off or more", systemImage: "percent")
            }
        }
        .tint(Theme.primary)
    }

    // MARK: Actions

    private func applyAndDismiss() {
        if radius != app.discovery.radiusMiles, app.discovery.mode == .nearby {
            let center = app.discovery.center
            Task { await app.applyDiscovery(.nearby(center: center, radiusMiles: radius)) }
        }
        onChange()
        Haptics.impact(.light)
        dismiss()
    }

    private func useCurrentLocation() {
        isLocating = true
        locationError = nil
        Task { @MainActor in
            defer { isLocating = false }
            do {
                try await app.refreshFromDeviceLocation()
                radius = app.discovery.radiusMiles
                Haptics.selection()
            } catch let error as LocationProviderError {
                locationError = Self.message(for: error)
            } catch {
                locationError = "We couldn't get your location right now."
            }
        }
    }

    private static func message(for error: LocationProviderError) -> String {
        switch error {
        case .denied: return "Location access is off. Turn it on in Settings to use your location."
        case .restricted: return "Location is restricted on this device."
        case .unavailable, .timeout: return "We couldn't get your location right now."
        }
    }

    // MARK: Helpers

    private func filterButton(title: String, symbol: String, category: DealCategory?) -> some View {
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
                .background(Capsule().fill(selected ? Theme.primary : Theme.surface))
                .overlay(Capsule().stroke(selected ? .clear : Theme.separator, lineWidth: 1))
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

    private func selectionChip(_ title: String, symbol: String, selected: Bool, action: @escaping () -> Void) -> some View {
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

    private func filterCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            content()
        }
        .padding(Spacing.md)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.lg))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg).stroke(Theme.separator, lineWidth: 1))
    }
}
