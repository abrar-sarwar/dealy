import SwiftUI
import CoreLocation

struct ExploreView: View {
    @Environment(AppState.self) private var app

    @State private var searchText = ""
    @State private var activeCategory: DealCategory?
    @State private var selectedDeal: Deal?
    @State private var showLocation = false
    @State private var localFilter: DealCategoryFilter = .all
    @State private var showSmartBasket = false
    @State private var showFoodRun = false
    @State private var foodRunPreset: FoodRunIntent?

    /// Deals available for browsing & search. The service already returns
    /// discovery-eligible inventory, so we only drop expired ones here.
    private var areaDeals: [Deal] {
        DealFilter.active(app.allDeals)
    }

    private var isSearching: Bool {
        !searchText.trimmingCharacters(in: .whitespaces).isEmpty || activeCategory != nil
    }

    private var results: [Deal] {
        var deals = areaDeals
        if let activeCategory { deals = deals.filter { $0.category == activeCategory } }
        deals = DealFilter.search(deals, query: searchText)
        return DealRanker.rank(deals, interests: app.interests, campus: app.currentCampus, radius: app.radius)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    categoryShortcuts
                    smartBasketSection
                    if isSearching {
                        resultsSection
                    } else {
                        curatedSections
                    }
                }
                .padding(.vertical, Spacing.md)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Explore")
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: "Search deals, stores, categories")
            .sheet(item: $selectedDeal) { DealDetailView(deal: $0) }
            .sheet(isPresented: $showLocation) {
                LocationSelectorView()
            }
            .fullScreenCover(isPresented: $showSmartBasket) {
                SmartBasketSetupView(onClose: { showSmartBasket = false })
            }
            .fullScreenCover(isPresented: $showFoodRun) {
                FoodRunView(onClose: { showFoodRun = false }, presetGoal: foodRunPreset)
            }
            .task { await app.loadPlaceSections() }
            .task { await app.loadStudentDeals() }
            .task { await app.loadTrendingDeals() }
            .task { await app.loadLocalDeals() }
            .task { await app.loadMissedDeals() }
        }
    }

    // MARK: Smart Basket entry

    /// Smart Basket hero plus a lighter "Cheap Food Run" entry, near the top of
    /// Explore. Opens the respective flows as full-screen covers.
    private var smartBasketSection: some View {
        VStack(spacing: Spacing.sm) {
            SmartBasketEntryCard { Haptics.selection(); showSmartBasket = true }
                .padding(.horizontal, Spacing.lg)
            FoodRunEntryCard {
                Haptics.selection(); foodRunPreset = nil; showFoodRun = true
            }
            .padding(.horizontal, Spacing.lg)
            FoodRunDecisionDeckView { goal in
                foodRunPreset = goal; showFoodRun = true
            }
        }
    }

    // MARK: Local filter chips

    /// A horizontal row of category filter chips over the Local Deals section.
    /// Only chips that match ≥1 local deal are shown, each with a live count.
    private var localFilterChips: some View {
        let filters = DealFilter.availableFilters(in: app.localDeals)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(filters) { filter in
                    let count = DealFilter.count(app.localDeals, for: filter)
                    let selected = localFilter == filter
                    Button {
                        Haptics.selection()
                        withAnimation(.snappy) { localFilter = filter }
                    } label: {
                        InfoChip(symbol: filter.symbol,
                                 text: "\(filter.label) · \(count)",
                                 tint: Theme.primary,
                                 filled: selected)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(filter.label), \(count) deals")
                    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    // MARK: Local savings feed (enriched places)

    /// The ranked enriched-place sections, each a titled horizontal carousel of
    /// `PlaceTile`s. Empty sections are skipped; the whole feed is omitted when
    /// there are no places (graceful empty — Explore's other sections remain).
    @ViewBuilder
    private var placeSectionsFeed: some View {
        let sections = app.placeSections.filter { !$0.places.isEmpty }
        if !sections.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                ForEach(sections) { section in
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        SectionHeader(title: section.displayTitle, symbol: "mappin.and.ellipse")
                            .padding(.horizontal, Spacing.lg)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Spacing.sm) {
                                ForEach(section.places) { place in
                                    PlaceTile(place: place) { openDirections(to: place) }
                                }
                            }
                            .padding(.horizontal, Spacing.lg)
                        }
                    }
                }
            }
        }
    }

    /// Launch turn-by-turn directions to a place when it has coordinates.
    private func openDirections(to place: Place) {
        guard let lat = place.latitude, let lng = place.longitude else { return }
        Haptics.selection()
        DirectionsLauncher.open(
            to: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            name: place.name)
    }

    // MARK: Category shortcuts

    private var categoryShortcuts: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.sm) {
                ForEach(DealCategory.allCases) { category in
                    Button {
                        Haptics.selection()
                        withAnimation(.snappy) {
                            activeCategory = (activeCategory == category) ? nil : category
                        }
                    } label: {
                        VStack(spacing: 6) {
                            ZStack {
                                Circle()
                                    .fill(activeCategory == category
                                          ? AnyShapeStyle(category.gradient)
                                          : AnyShapeStyle(category.gradientColors.first!.opacity(0.14)))
                                    .frame(width: 56, height: 56)
                                Image(systemName: category.symbol)
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(activeCategory == category ? .white : category.gradientColors.first!)
                            }
                            Text(category.displayName)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(Theme.mutedText)
                                .lineLimit(1)
                        }
                        .frame(width: 72)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(category.displayName)
                    .accessibilityAddTraits(activeCategory == category ? [.isButton, .isSelected] : .isButton)
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    // MARK: Search results

    private var resultsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                SectionHeader(title: resultsTitle)
                Button("Clear") {
                    withAnimation { searchText = ""; activeCategory = nil }
                }
                .font(.subheadline.weight(.semibold))
            }
            .padding(.horizontal, Spacing.lg)

            if results.isEmpty {
                EmptyStateView(
                    symbol: "magnifyingglass",
                    title: "No matches",
                    message: "We couldn’t find deals for that here. Try a different term, category, or a wider radius.",
                    primaryTitle: "Reset search",
                    primaryAction: { withAnimation { searchText = ""; activeCategory = nil } }
                )
            } else {
                LazyVStack(spacing: Spacing.sm) {
                    ForEach(results) { deal in
                        DealRowCard(deal: deal) { app.recordOpened(deal.id); selectedDeal = deal }
                            .onAppear { app.recordImpression(deal.id) }
                    }
                }
                .padding(.horizontal, Spacing.lg)
            }
        }
    }

    private var resultsTitle: String {
        if let activeCategory {
            return "\(activeCategory.displayName) · \(results.count)"
        }
        return "\(results.count) result\(results.count == 1 ? "" : "s")"
    }

    // MARK: Curated

    private var curatedSections: some View {
        let sections = ExploreSections(base: areaDeals)
            .curated(interests: app.interests, campus: app.currentCampus, radius: app.radius)
        return VStack(alignment: .leading, spacing: Spacing.xl) {
            // The local savings feed: enriched local businesses ranked into
            // sections (cheap eats, hidden gems, student-friendly, …). Sits at
            // the top — these are the places near the user worth knowing about.
            placeSectionsFeed
            // Cross-campus trending deals, featured regardless of location.
            TrendingSection(deals: app.trendingDeals) { deal in
                app.recordOpened(deal.id)
                selectedDeal = deal
            }
            // Always-available curated student programs (location-independent).
            StudentPerksSection(deals: app.studentDeals) { deal in
                app.recordOpened(deal.id)
                selectedDeal = deal
            }
            // Curated local deals within ~15mi (restaurants, cafés, student spots).
            // Filterable by a coarse, user-facing category chip row.
            if !app.localDeals.isEmpty {
                localFilterChips
            }
            LocalDealsSection(deals: DealFilter.byCategoryFilter(app.localDeals, localFilter)) { deal in
                app.recordOpened(deal.id)
                selectedDeal = deal
            }
            // Recently-expired local deals — visible but never redeemable.
            MissedDealsSection(deals: app.missedDeals)
            if sections.isEmpty {
                EmptyStateView(symbol: "map",
                               title: "Nothing here yet",
                               message: app.discovery.mode == .anywhere
                                ? "No online deals to show right now. Check back soon."
                                : "No deals match \(app.discovery.center.displayName) at \(app.discovery.radiusMiles) mi. Tap the location chip to widen your radius or browse Anywhere.",
                               primaryTitle: "Change location",
                               primaryAction: { showLocation = true })
                    .padding(.top, Spacing.xl)
            } else {
                ForEach(sections) { section in
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        SectionHeader(title: section.title, symbol: section.symbol)
                            .padding(.horizontal, Spacing.lg)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Spacing.sm) {
                                ForEach(section.deals) { deal in
                                    DealTile(deal: deal) { app.recordOpened(deal.id); selectedDeal = deal }
                                        .onAppear { app.recordImpression(deal.id) }
                                }
                            }
                            .padding(.horizontal, Spacing.lg)
                        }
                    }
                }
            }
        }
    }
}
