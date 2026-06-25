import SwiftUI

struct ExploreView: View {
    @Environment(AppState.self) private var app

    @State private var searchText = ""
    @State private var activeCategory: DealCategory?
    @State private var selectedDeal: Deal?
    @State private var showLocation = false

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
            .task { await app.loadStudentDeals() }
            .task { await app.loadTrendingDeals() }
            .task { await app.loadLocalDeals() }
            .task { await app.loadMissedDeals() }
        }
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
            LocalDealsSection(deals: app.localDeals) { deal in
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
