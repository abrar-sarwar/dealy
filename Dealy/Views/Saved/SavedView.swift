import SwiftUI
import CoreLocation

struct SavedView: View {
    @Environment(AppState.self) private var app
    @Environment(TabRouter.self) private var router
    @State private var filter: DealCategory?
    @State private var selectedDeal: Deal?
    @State private var selectedBasket: SmartBasket?

    private var savedDeals: [Deal] {
        let all = app.savedDeals
        guard let filter else { return all }
        return all.filter { $0.category == filter }
    }

    private var availableCategories: [DealCategory] {
        var seen = Set<DealCategory>()
        return app.savedDeals.compactMap { deal in
            guard !seen.contains(deal.category) else { return nil }
            seen.insert(deal.category); return deal.category
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if app.savedCount == 0 && app.savedBasketCount == 0 && app.savedPlaceCount == 0 {
                    EmptyStateView(
                        symbol: "heart.text.square",
                        title: "No saved deals yet",
                        message: "Swipe right on deals you like and they’ll show up here, ready when you are.",
                        primaryTitle: "Find deals",
                        primaryAction: { switchToHome() }
                    )
                } else {
                    list
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Saved")
            .toolbar {
                if !availableCategories.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) { filterMenu }
                }
            }
            .sheet(item: $selectedDeal) { DealDetailView(deal: $0) }
            .fullScreenCover(item: $selectedBasket) { basket in
                NavigationStack {
                    GeneratedBasketView(basket: basket, request: nil,
                                        onClose: { selectedBasket = nil })
                }
            }
        }
    }

    private var list: some View {
        List {
            Section {
                SavingsSummaryCard()
                    .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.lg,
                                              bottom: Spacing.md, trailing: Spacing.lg))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if app.savedPlaceCount > 0 {
                Section {
                    ForEach(app.savedPlaces) { place in
                        SavedPlaceRow(place: place)
                            .contentShape(Rectangle())
                            .onTapGesture { openDirections(to: place) }
                            .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.lg,
                                                      bottom: Spacing.xs, trailing: Spacing.lg))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    removePlace(place)
                                } label: { Label("Remove", systemImage: "trash") }
                            }
                    }
                } header: {
                    Text("Food Run places · \(app.savedPlaceCount)")
                }
            }

            if app.savedBasketCount > 0 {
                Section {
                    ForEach(app.savedBaskets) { basket in
                        SavedBasketRow(basket: basket)
                            .contentShape(Rectangle())
                            .onTapGesture { selectedBasket = basket }
                            .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.lg,
                                                      bottom: Spacing.xs, trailing: Spacing.lg))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    removeBasket(basket)
                                } label: { Label("Remove", systemImage: "trash") }
                            }
                    }
                } header: {
                    Text("Smart Baskets · \(app.savedBasketCount)")
                }
            }

            if app.savedCount > 0 {
            Section {
                ForEach(savedDeals) { deal in
                    DealRowCard(deal: deal) { selectedDeal = deal }
                        .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.lg,
                                                  bottom: Spacing.xs, trailing: Spacing.lg))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                remove(deal)
                            } label: { Label("Remove", systemImage: "trash") }
                        }
                        .swipeActions(edge: .leading) {
                            Button {
                                _ = app.toggleWatched(deal.id); Haptics.impact(.light)
                            } label: {
                                Label(app.isWatched(deal.id) ? "Unwatch" : "Watch",
                                      systemImage: app.isWatched(deal.id) ? "bell.slash" : "bell")
                            }
                            .tint(Theme.watch)
                        }
                }
            } header: {
                if let filter {
                    Text("\(filter.displayName) · \(savedDeals.count)")
                } else {
                    Text("\(app.savedCount) saved")
                }
            }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private var filterMenu: some View {
        Menu {
            Button { filter = nil } label: {
                Label("All categories", systemImage: filter == nil ? "checkmark" : "")
            }
            ForEach(availableCategories) { category in
                Button { filter = category } label: {
                    Label(category.displayName, systemImage: filter == category ? "checkmark" : category.symbol)
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .accessibilityLabel("Filter saved deals")
        }
    }

    private func remove(_ deal: Deal) {
        withAnimation { app.unsave(deal.id) }
        Haptics.impact(.light)
    }

    private func removeBasket(_ basket: SmartBasket) {
        withAnimation { app.removeBasket(basket.id) }
        Haptics.impact(.light)
    }

    private func removePlace(_ place: Place) {
        withAnimation { app.removePlace(place.id) }
        Haptics.impact(.light)
    }

    private func openDirections(to place: Place) {
        guard let lat = place.latitude, let lng = place.longitude else { return }
        Haptics.selection()
        DirectionsLauncher.open(
            to: CLLocationCoordinate2D(latitude: lat, longitude: lng), name: place.name)
    }

    private func switchToHome() {
        Haptics.selection()
        router.selection = .home
    }
}

/// Compact row summarizing a saved Smart Basket in the Saved tab.
private struct SavedBasketRow: View {
    let basket: SmartBasket

    var body: some View {
        HStack(spacing: Spacing.sm) {
            ZStack {
                RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                    .fill(Theme.primary.opacity(0.12))
                    .frame(width: 44, height: 44)
                Image(systemName: "cart.fill")
                    .font(.headline)
                    .foregroundStyle(Theme.primary)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(basket.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                    .lineLimit(2)
                HStack(spacing: Spacing.xs) {
                    Text("\(basket.items.count) items · \(Format.price(basket.estimatedTotal))")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedText)
                    ConfidenceBadge(confidence: basket.confidence)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.faintText)
        }
        .padding(Spacing.md)
        .dealyCardSurface()
    }
}

/// Compact row summarizing a saved Food Run place in the Saved tab.
private struct SavedPlaceRow: View {
    let place: Place

    private var metaLine: String {
        var parts: [String] = []
        if let bucket = place.priceBucket, !bucket.isEmpty { parts.append(bucket) }
        if let rating = place.rating { parts.append(String(format: "★%.1f", rating)) }
        if let distance = place.distanceDisplay { parts.append(distance) }
        parts.append(place.category.displayName)
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: Spacing.sm) {
            PlaceImage(photoURL: place.primaryPhotoUrl,
                       category: place.category, seed: place.visualSeed)
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                    .lineLimit(1)
                Text(metaLine)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedText)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if place.hasCoordinates {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    .font(.headline)
                    .foregroundStyle(Theme.primary)
            }
        }
        .padding(Spacing.md)
        .dealyCardSurface()
    }
}
