import SwiftUI
import MapKit
import UIKit

/// Polished local-deal browser. A category-chip row + radius control sit above a
/// zone-locked map of nearby deals; a single strip of the filtered deals runs
/// underneath. The map frames the *selected radius* (never the farthest outlier)
/// and centers on the device location once resolved, else the discovery center.
/// Tapping a pin selects it and scrolls the strip to the matching card; the two
/// stay in sync. Pins are category- and precision-aware (exact = solid, approximate
/// = faded + dashed). Nothing decorative — chips, radius, caption, recenter, strip.
struct DealsMapView: View {
    @Environment(AppState.self) private var app

    @State private var position: MapCameraPosition = .automatic
    @State private var anchor: CLLocationCoordinate2D?
    @State private var selectedID: String?
    @State private var detailDeal: Deal?
    @State private var isLocating = false

    @State private var categoryFilter: DealCategoryFilter = .all
    /// Display radius (miles). Initialized once the feed loads to the smallest
    /// radius with a useful count (see `MapCameraModel.defaultRadius`).
    @State private var displayRadius: Int = 5
    @State private var didInitRadius = false

    /// Map center / pin anchor: the real device location once resolved, else the
    /// current discovery center as a fallback.
    private var center: CLLocationCoordinate2D {
        anchor ?? CLLocationCoordinate2D(latitude: app.discovery.center.latitude,
                                         longitude: app.discovery.center.longitude)
    }

    /// All physical, active deals from the curated local feed, nearest-first.
    private var mappableAll: [Deal] { MapCameraModel.mappable(app.localDeals) }

    /// The deals actually drawn / listed: category + radius filtered.
    private var visible: [Deal] {
        MapCameraModel.filtered(mappableAll, category: categoryFilter, radiusMiles: displayRadius)
    }

    /// Chips to show for this inventory (only filters that match ≥1 mappable deal).
    private var availableFilters: [DealCategoryFilter] {
        DealFilter.availableFilters(in: mappableAll)
    }

    private var radiusMeters: CLLocationDistance { MapCameraModel.radiusMeters(displayRadius) }

    private func region() -> MKCoordinateRegion {
        MapCameraModel.region(center: center, radiusMiles: displayRadius)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                controls
                mapArea
                dealStrip
            }
            .navigationTitle("Map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { resolveLocation(force: true) } label: {
                        if isLocating { ProgressView() } else { Image(systemName: "location.circle") }
                    }
                    .accessibilityLabel("Center on my location")
                }
            }
            .sheet(item: $detailDeal) { DealDetailView(deal: $0) }
            .onAppear { resolveLocation(force: false) }
            .task {
                await app.loadLocalDeals()
                initRadiusIfNeeded()
                reframe()
            }
            .onChange(of: categoryFilter) { _, _ in clampSelection(); reframe() }
            .onChange(of: displayRadius) { _, _ in clampSelection(); reframe() }
        }
    }

    // MARK: Controls (category chips + radius)

    private var controls: some View {
        VStack(spacing: Spacing.xs) {
            categoryChips
            radiusControl
        }
        .padding(.top, Spacing.xs)
        .padding(.bottom, Spacing.xs)
        .background(Theme.background)
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(availableFilters) { filter in
                    let n = MapCameraModel.count(for: mappableAll, radiusMiles: displayRadius, category: filter)
                    chip(
                        symbol: filter.symbol,
                        text: "\(filter.label) · \(n)",
                        selected: categoryFilter == filter
                    ) {
                        withAnimation(.easeInOut(duration: 0.2)) { categoryFilter = filter }
                        Haptics.selection()
                    }
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    private var radiusControl: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(MapCameraModel.radiusOptions, id: \.self) { r in
                    let n = MapCameraModel.count(for: mappableAll, radiusMiles: r, category: categoryFilter)
                    chip(
                        symbol: "scope",
                        text: "\(r) mi · \(n)",
                        selected: displayRadius == r
                    ) {
                        withAnimation(.easeInOut(duration: 0.2)) { displayRadius = r }
                        Haptics.selection()
                    }
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    /// Pill chip used by both control rows. Selected = solid Theme.primary.
    private func chip(symbol: String, text: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: symbol).font(.caption2.weight(.bold))
                Text(text).font(.caption.weight(.semibold))
            }
            .foregroundStyle(selected ? .white : Theme.primary)
            .padding(.vertical, 6)
            .padding(.horizontal, Spacing.sm)
            .background(
                Capsule().fill(selected ? AnyShapeStyle(Theme.primary) : AnyShapeStyle(Theme.primary.opacity(0.12)))
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Map

    private var mapArea: some View {
        Map(position: $position) {
            MapCircle(center: center, radius: radiusMeters)
                .foregroundStyle(Theme.primary.opacity(0.10))
                .stroke(Theme.primary.opacity(0.7), lineWidth: 2.5)

            Annotation("You", coordinate: center) { centerPin }
                .annotationTitles(.hidden)

            ForEach(visible) { deal in
                Annotation(deal.merchant, coordinate: DealGeo.coordinate(for: deal, around: center)) {
                    DealMapPin(deal: deal, selected: selectedID == deal.id)
                        .onTapGesture { select(deal.id) }
                }
                .annotationTitles(.hidden)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls { MapCompass() }
        .overlay(alignment: .top) { permissionBanner }
        .overlay(alignment: .topLeading) { caption }
        .overlay(alignment: .bottomTrailing) { recenterPill }
        .overlay { emptyOverlay }
    }

    @ViewBuilder private var permissionBanner: some View {
        if app.locationAuthorization == .denied || app.locationAuthorization == .restricted {
            Button { openSettings() } label: {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "location.slash.fill")
                    Text("Location is off — tap to share your location")
                        .font(.caption.weight(.semibold))
                    Image(systemName: "arrow.up.forward")
                }
                .foregroundStyle(.white)
                .padding(.vertical, 8).padding(.horizontal, Spacing.sm)
                .background(Theme.primary, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, Spacing.xs)
        }
    }

    /// Honest precision caption for the visible deals.
    @ViewBuilder private var caption: some View {
        if let text = MapCameraModel.caption(for: visible) {
            Text(text)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Theme.primaryText)
                .padding(.vertical, 6).padding(.horizontal, Spacing.sm)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(Spacing.sm)
        }
    }

    /// "Deals near me" pill — reframes to current center + radius after the user
    /// has panned/zoomed away. Never fights manual gestures; just offers a reset.
    private var recenterPill: some View {
        Button { reframe(); Haptics.selection() } label: {
            HStack(spacing: 6) {
                Image(systemName: "location.fill").font(.caption2.weight(.bold))
                Text("Deals near me").font(.caption.weight(.semibold))
            }
            .foregroundStyle(Theme.primary)
            .padding(.vertical, 8).padding(.horizontal, Spacing.sm)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Theme.primary.opacity(0.25), lineWidth: 1))
            .dealyShadow(.soft)
        }
        .buttonStyle(.plain)
        .padding(Spacing.sm)
        .accessibilityLabel("Recenter on deals near me")
    }

    private var centerPin: some View {
        ZStack {
            Circle().fill(Theme.primary.opacity(0.25)).frame(width: 30, height: 30)
            Circle().fill(.white).frame(width: 18, height: 18).dealyShadow(.soft)
            Circle().fill(Theme.primary).frame(width: 11, height: 11)
        }
        .accessibilityLabel("Your location")
    }

    @ViewBuilder private var emptyOverlay: some View {
        if visible.isEmpty && !mappableAll.isEmpty {
            VStack(spacing: Spacing.sm) {
                Image(systemName: "mappin.slash")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Theme.mutedText)
                Text(emptyTitle)
                    .font(.headline).foregroundStyle(Theme.primaryText)
                    .multilineTextAlignment(.center)
                emptyAction
            }
            .padding(Spacing.lg)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg))
            .padding(Spacing.lg)
        } else if mappableAll.isEmpty {
            VStack(spacing: Spacing.sm) {
                Image(systemName: "mappin.slash")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Theme.mutedText)
                Text("No deals to map here")
                    .font(.headline).foregroundStyle(Theme.primaryText)
            }
            .padding(Spacing.lg)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg))
            .padding(Spacing.lg)
        }
    }

    private var emptyTitle: String {
        let label = categoryFilter == .all ? "deals" : "\(categoryFilter.label.lowercased()) deals"
        return "No \(label) within \(displayRadius) mi"
    }

    /// Directional recovery: widen the radius, or clear the category back to All.
    @ViewBuilder private var emptyAction: some View {
        let widerRadius = MapCameraModel.radiusOptions.first { $0 > displayRadius }
        HStack(spacing: Spacing.xs) {
            if let wider = widerRadius {
                chip(symbol: "scope", text: "Try \(wider) mi", selected: false) {
                    withAnimation(.easeInOut(duration: 0.2)) { displayRadius = wider }
                }
            }
            if categoryFilter != .all {
                chip(symbol: "square.grid.2x2", text: "Show All", selected: false) {
                    withAnimation(.easeInOut(duration: 0.2)) { categoryFilter = .all }
                }
            }
        }
    }

    // MARK: Deal strip (single, filtered, selection-coupled)

    private var dealStrip: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !visible.isEmpty {
                Text("\(visible.count) nearby")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.primaryText)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, 8)
            }
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.sm) {
                        ForEach(visible) { deal in
                            stripCard(deal)
                                .id(deal.id)
                        }
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, 8)
                }
                .onChange(of: selectedID) { _, id in
                    guard let id else { return }
                    withAnimation(.easeInOut) { proxy.scrollTo(id, anchor: .center) }
                }
            }
        }
        .background(Theme.background)
    }

    /// Compact card; highlights when its pin is selected. Tapping selects (coupling
    /// pin + strip) on first tap and opens detail on the selected card.
    private func stripCard(_ deal: Deal) -> some View {
        let isSelected = selectedID == deal.id
        return Button {
            if isSelected {
                app.recordOpened(deal.id)
                detailDeal = deal
            } else {
                select(deal.id)
            }
        } label: {
            HStack(spacing: Spacing.sm) {
                DealImage(deal: deal)
                    .frame(width: 50, height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(deal.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(1)
                    Text(deal.merchant)
                        .font(.caption2)
                        .foregroundStyle(Theme.mutedText)
                        .lineLimit(1)
                    if deal.hasFixedPricing {
                        Text(Format.price(deal.currentPrice))
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Theme.primary)
                    }
                }
                .frame(width: 116, alignment: .leading)
            }
            .padding(8)
            .background(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).fill(Theme.surface))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .stroke(isSelected ? Theme.primary : Theme.separator, lineWidth: isSelected ? 2 : 0.75)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(isSelected ? "Opens deal details" : "Selects this deal on the map")
    }

    // MARK: Selection + framing

    private func select(_ id: String) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            selectedID = (selectedID == id) ? nil : id
        }
        Haptics.selection()
    }

    /// Drop a stale selection when the filter/radius hides the selected deal.
    private func clampSelection() {
        if let id = selectedID, !visible.contains(where: { $0.id == id }) {
            selectedID = nil
        }
    }

    private func reframe() {
        withAnimation { position = .region(region()) }
    }

    private func initRadiusIfNeeded() {
        guard !didInitRadius else { return }
        didInitRadius = true
        displayRadius = MapCameraModel.defaultRadius(for: app.localDeals)
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: Actual location

    private func resolveLocation(force: Bool) {
        guard force || anchor == nil else { return }
        isLocating = true
        Task { @MainActor in
            defer { isLocating = false }
            if let center = try? await app.resolveDeviceCenter() {
                anchor = CLLocationCoordinate2D(latitude: center.latitude, longitude: center.longitude)
            }
            reframe()
        }
    }
}

/// Map pin: a category-tinted bubble that grows when selected. Exact-location deals
/// render solid with a white ring; approximate deals render faded with a thin
/// dashed ring so the placement reads as region-level, not a real storefront.
private struct DealMapPin: View {
    let deal: Deal
    let selected: Bool

    private var isApproximate: Bool { deal.isApproximateLocation }
    private var size: CGFloat { selected ? 46 : 36 }
    private var iconSize: CGFloat { selected ? 19 : 15 }
    private var symbol: String { MapCameraModel.pinSymbol(for: deal) }

    var body: some View {
        ZStack {
            Circle()
                .fill(deal.category.gradient)
                .opacity(isApproximate ? 0.45 : 1.0)
                .frame(width: size, height: size)
                .overlay {
                    if isApproximate {
                        Circle()
                            .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            .foregroundStyle(.white.opacity(0.85))
                    } else {
                        Circle().stroke(.white, lineWidth: 2.5)
                    }
                }
                .dealyShadow(.soft)
            Image(systemName: symbol)
                .font(.system(size: iconSize, weight: .bold))
                .foregroundStyle(.white.opacity(isApproximate ? 0.7 : 1.0))
        }
        .accessibilityLabel("\(deal.title) at \(deal.merchant)")
    }
}
