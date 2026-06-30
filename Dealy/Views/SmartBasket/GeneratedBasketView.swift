import SwiftUI

/// The generated Smart Basket screen: title, best-store recommendation, estimated
/// total, confidence, grouped items with trust chips, matched deals, suggested
/// swaps, an optional second-stop card, and actions (Open in Maps · Save ·
/// Regenerate · Adjust Budget · Remove · Swap · Use this basket).
///
/// When `request` is nil the basket is read-only (e.g. opened from Saved), so the
/// regenerate / adjust-budget affordances are hidden.
struct GeneratedBasketView: View {
    @Environment(AppState.self) private var app
    @Environment(\.openURL) private var openURL

    @State private var basket: SmartBasket
    @State private var request: BasketRequest?
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var showBudgetSheet = false

    let onClose: () -> Void

    init(basket: SmartBasket, request: BasketRequest?, onClose: @escaping () -> Void) {
        _basket = State(initialValue: basket)
        _request = State(initialValue: request)
        self.onClose = onClose
    }

    private var canAdjust: Bool { request != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                headerSection
                if basket.showsLowDataBanner { lowDataBanner }
                totalsSection
                if let store = basket.bestStore { bestStoreSection(store) }
                itemsSection
                if !basket.matchedDeals.isEmpty { matchedDealsSection }
                if !basket.substitutions.isEmpty { swapsSection }
                if let second = basket.optionalSecondStore { secondStopSection(second) }
                if !basket.explanation.isEmpty { explanationSection }
                actionsSection
            }
            .padding(Spacing.lg)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Smart Basket")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { onClose() }
                    .font(.subheadline.weight(.semibold))
            }
        }
        .overlay { if isWorking { workingOverlay } }
        .alert("Something went wrong", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
        .sheet(isPresented: $showBudgetSheet) {
            AdjustBudgetSheet(currentBudget: request?.budget ?? 35) { newBudget in
                Task { await adjustBudget(to: newBudget) }
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: Sections

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(basket.title)
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            HStack(spacing: Spacing.xs) {
                ConfidenceBadge(confidence: basket.confidence)
                TrustLabelChip(label: basket.sourceStatus)
            }
            if let route = basket.routeSummary, !route.isEmpty {
                Label(route, systemImage: "map")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.mutedText)
            }
        }
    }

    private var lowDataBanner: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: "info.circle.fill")
                .foregroundStyle(Theme.watch)
            Text("Not enough verified grocery deals here yet. I can still build an estimated basket from student staples and nearby stores.")
                .font(.footnote)
                .foregroundStyle(Theme.primaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Spacing.md)
        .background(
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .fill(Theme.watch.opacity(0.12))
        )
    }

    private var totalsSection: some View {
        DealyCard {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Estimated total")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.mutedText)
                    Text(Format.price(basket.estimatedTotal))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.primaryText)
                }
                Spacer()
                if basket.estimatedSavings > 0 {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Est. savings")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.mutedText)
                        Text(Format.price(basket.estimatedSavings))
                            .font(.title3.weight(.bold))
                            .foregroundStyle(Theme.save)
                    }
                }
            }
        }
    }

    private func bestStoreSection(_ store: StoreRecommendation) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Best overall", symbol: "star.fill")
            StoreRecommendationCard(store: store) { openInMaps(store) }
        }
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Your basket · \(basket.items.count)", symbol: "cart.fill")
            DealyCard {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    ForEach(Array(basket.itemsByCategory.enumerated()), id: \.element.category) { index, group in
                        if index > 0 { Divider() }
                        Text(group.items.first?.categoryDisplay ?? group.category)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Theme.mutedText)
                            .textCase(.uppercase)
                        ForEach(group.items) { item in
                            BasketItemRow(
                                item: item,
                                onRemove: canAdjust ? { remove(item) } : nil,
                                onSwap: canAdjust ? { swap(item, for: $0) } : nil
                            )
                        }
                    }
                }
            }
        }
    }

    private var matchedDealsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Matched deals", symbol: "tag.fill")
            VStack(spacing: Spacing.sm) {
                ForEach(basket.matchedDeals) { deal in
                    matchedDealRow(deal)
                }
            }
        }
    }

    private func matchedDealRow(_ deal: BasketDealMatch) -> some View {
        DealyCard {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(deal.merchant)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.primaryText)
                    Spacer()
                    ConfidenceBadge(confidence: deal.confidence)
                }
                Text(deal.title)
                    .font(.subheadline)
                    .foregroundStyle(Theme.primaryText)
                HStack(spacing: Spacing.xs) {
                    if !deal.discount.isEmpty {
                        InfoChip(symbol: "percent", text: deal.discount, tint: Theme.save, filled: true)
                    }
                    if deal.price > 0 {
                        Text(Format.price(deal.price))
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Theme.primaryText)
                    }
                    if let valid = deal.validUntil {
                        ExpiryChip(date: valid)
                    }
                }
            }
        }
    }

    private var swapsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Suggested swaps", symbol: "arrow.triangle.2.circlepath")
            FlowChips(items: basket.substitutions)
                .padding(.horizontal, Spacing.xxs)
        }
    }

    private func secondStopSection(_ store: StoreRecommendation) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Worth a second stop?", symbol: "mappin.and.ellipse")
            StoreRecommendationCard(store: store) { openInMaps(store) }
        }
    }

    private var explanationSection: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: "sparkles")
                .foregroundStyle(Theme.primary)
            Text(basket.explanation)
                .font(.footnote)
                .foregroundStyle(Theme.mutedText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Spacing.md)
        .dealyCardSurface(cornerRadius: Radius.md)
    }

    private var actionsSection: some View {
        VStack(spacing: Spacing.sm) {
            Button { useBasket() } label: {
                Label("Use this basket", systemImage: "checkmark.circle.fill")
            }
            .buttonStyle(.primaryDealy)

            HStack(spacing: Spacing.sm) {
                Button { toggleSave() } label: {
                    Label(isSaved ? "Saved" : "Save Basket",
                          systemImage: isSaved ? "bookmark.fill" : "bookmark")
                }
                .buttonStyle(SecondaryButtonStyle(fullWidth: true))

                if canAdjust {
                    Button { Task { await regenerate() } } label: {
                        Label("Regenerate", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(SecondaryButtonStyle(fullWidth: true))
                }
            }

            if canAdjust {
                Button { showBudgetSheet = true } label: {
                    Label("Adjust budget", systemImage: "slider.horizontal.3")
                }
                .buttonStyle(GhostButtonStyle(fullWidth: true))
            }
        }
        .padding(.top, Spacing.xs)
    }

    private var workingOverlay: some View {
        ZStack {
            Color.black.opacity(0.15).ignoresSafeArea()
            ProgressView()
                .padding(Spacing.lg)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
    }

    // MARK: Actions

    private var isSaved: Bool { app.isBasketSaved(basket.id) }

    private func remove(_ item: BasketItem) {
        withAnimation { basket.items.removeAll { $0.id == item.id } }
        Haptics.impact(.light)
    }

    private func swap(_ item: BasketItem, for substitution: String) {
        guard let index = basket.items.firstIndex(where: { $0.id == item.id }) else { return }
        let replacement = BasketItem(
            id: item.id,
            name: substitution,
            category: item.category,
            estimatedPrice: item.estimatedPrice,
            quantity: item.quantity,
            unit: item.unit,
            store: item.store,
            matchedDealId: nil,
            confidence: item.confidence,
            trustLabel: .estimated,
            substitutionOptions: item.substitutionOptions.filter { $0 != substitution } + [item.name]
        )
        withAnimation { basket.items[index] = replacement }
        Haptics.selection()
    }

    private func toggleSave() {
        _ = app.toggleBasketSaved(basket)
        Haptics.impact(.light)
    }

    private func useBasket() {
        if !isSaved { app.saveBasket(basket) }
        Haptics.impact(.medium)
        onClose()
    }

    private func regenerate() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let fresh = try await app.regenerateBasket(id: basket.id)
            withAnimation { basket = fresh }
            Haptics.impact(.light)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func adjustBudget(to newBudget: Int) async {
        guard var req = request else { return }
        req.budget = newBudget
        request = req
        isWorking = true
        defer { isWorking = false }
        do {
            let fresh = try await app.generateBasket(req)
            withAnimation { basket = fresh }
            Haptics.impact(.light)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Route to the store. When the backend resolved storefront coordinates we
    /// launch turn-by-turn directions via `DirectionsLauncher`; otherwise we fall
    /// back to a maps name search (anchored near the user by the system).
    private func openInMaps(_ store: StoreRecommendation) {
        if let coordinate = store.coordinate {
            Haptics.selection()
            DirectionsLauncher.open(to: coordinate, name: store.name)
            return
        }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "maps.apple.com"
        components.path = "/"
        components.queryItems = [URLQueryItem(name: "q", value: store.name)]
        if let url = components.url { openURL(url) }
    }
}

/// Compact budget picker presented when adjusting a generated basket's budget.
private struct AdjustBudgetSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var amount: Int
    let onApply: (Int) -> Void

    init(currentBudget: Int, onApply: @escaping (Int) -> Void) {
        _amount = State(initialValue: currentBudget)
        self.onApply = onApply
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                Text("How much do you want to spend?")
                    .font(.headline)
                    .foregroundStyle(Theme.primaryText)

                Text(Format.moneyWhole(Decimal(amount)))
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.primary)
                    .frame(maxWidth: .infinity)

                Stepper("Budget", value: $amount, in: 10...200, step: 5)
                    .labelsHidden()
                    .frame(maxWidth: .infinity)

                Button {
                    onApply(amount)
                    dismiss()
                } label: {
                    Text("Rebuild basket")
                }
                .buttonStyle(.primaryDealy)

                Spacer()
            }
            .padding(Spacing.lg)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Adjust budget")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
