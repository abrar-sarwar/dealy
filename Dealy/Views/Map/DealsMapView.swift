import SwiftUI
import MapKit
import UIKit

/// Local-deal browser BOUNDED to the Dealy service zone. By default it frames the
/// whole zone and shows EVERY mappable deal in the area — no small default radius.
/// All filtering (category, radius, precision, sort, student/campus/image toggles)
/// lives behind a single Filter button + sheet, so the map chrome stays minimal:
/// a Filter button, a recenter button, a deal-count label, and the bottom strip.
/// Tapping a pin selects it and scrolls the strip to the matching card; the two
/// stay in sync. Pins are category- and precision-aware (exact = solid, approximate
/// = faded + dashed). The camera cannot pan/zoom out past the metro.
struct DealsMapView: View {
    @Environment(AppState.self) private var app

    @State private var position: MapCameraPosition = .automatic
    @State private var anchor: CLLocationCoordinate2D?
    @State private var selectedID: String?
    @State private var detailDeal: Deal?
    @State private var isLocating = false

    @State private var filter = MapFilterState()
    @State private var showingFilters = false

    /// Map center / pin anchor: the real device location once resolved, else the
    /// current discovery center as a fallback.
    private var center: CLLocationCoordinate2D {
        anchor ?? CLLocationCoordinate2D(latitude: app.discovery.center.latitude,
                                         longitude: app.discovery.center.longitude)
    }

    /// All physical, active deals from the curated local feed, nearest-first.
    private var mappableAll: [Deal] { MapCameraModel.mappable(app.localDeals) }

    /// Filter lanes worth offering (only those matching ≥1 mappable deal), plus All.
    private var availableCategories: [DealCategoryFilter] {
        DealFilter.availableFilters(in: mappableAll)
    }

    /// The deals matching the active filter, ordered by the active sort.
    private var visible: [Deal] {
        let filtered = filter.apply(to: mappableAll)
        let ranked = DealRanker.diversified(
            DealRanker.rank(filtered,
                            interests: app.interests,
                            campus: app.currentCampus,
                            radius: filter.radiusMiles))
        return filter.sort.ordered(filtered, ranked: ranked)
    }

    private var countLabel: MapCameraModel.CountLabel {
        MapCameraModel.countLabel(shown: visible, totalMappable: mappableAll)
    }

    /// Bounds: the camera is locked to the Dealy service-zone box and cannot zoom
    /// out past the metro.
    private var cameraBounds: MapCameraBounds {
        MapCameraBounds(
            centerCoordinateBounds: MapCameraModel.zoneRegion(center: center),
            maximumDistance: MapCameraModel.zoneMaxDistanceMeters
        )
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
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
            .sheet(isPresented: $showingFilters) {
                MapFilterSheet(state: $filter, availableCategories: availableCategories)
            }
            .sheet(item: $detailDeal) { DealDetailView(deal: $0) }
            .onAppear { resolveLocation(force: false) }
            .task {
                await app.loadLocalDeals()
                reframe()
            }
            .onChange(of: filter) { _, _ in clampSelection(); reframe() }
        }
    }

    // MARK: Map

    private var mapArea: some View {
        Map(position: $position, bounds: cameraBounds) {
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
        .overlay(alignment: .topLeading) { filterButton }
        .overlay(alignment: .topTrailing) { countOverlay }
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

    /// The single Filter entry point. Its label reflects the active filter state
    /// ("Filters" by default, else a summary like "Food" / "5 mi" / "3 filters").
    private var filterButton: some View {
        Button {
            showingFilters = true
            Haptics.selection()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: filter.isDefault
                      ? "line.3.horizontal.decrease.circle"
                      : "line.3.horizontal.decrease.circle.fill")
                    .font(.caption.weight(.bold))
                Text(filter.summary).font(.caption.weight(.semibold))
            }
            .foregroundStyle(filter.isDefault ? Theme.primary : .white)
            .padding(.vertical, 8).padding(.horizontal, Spacing.sm)
            .background(
                Capsule().fill(filter.isDefault
                               ? AnyShapeStyle(.ultraThinMaterial)
                               : AnyShapeStyle(Theme.primary))
            )
            .overlay(Capsule().stroke(Theme.primary.opacity(0.25), lineWidth: filter.isDefault ? 1 : 0))
            .dealyShadow(.soft)
        }
        .buttonStyle(.plain)
        .padding(Spacing.sm)
        .accessibilityLabel("Filters")
        .accessibilityValue(filter.isDefault ? "None active" : filter.summary)
    }

    /// Deal-count label over the map, reflecting the active filter.
    @ViewBuilder private var countOverlay: some View {
        if !mappableAll.isEmpty {
            let label = countLabel
            VStack(alignment: .trailing, spacing: 2) {
                Text(label.primary)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.primaryText)
                if let breakdown = label.breakdown {
                    Text(breakdown)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.mutedText)
                }
                if let hint = label.hint {
                    Text(hint)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.primary)
                }
            }
            .multilineTextAlignment(.trailing)
            .padding(.vertical, 6).padding(.horizontal, Spacing.sm)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .padding(Spacing.sm)
            .frame(maxWidth: 220, alignment: .trailing)
        }
    }

    /// "Back to Dealy zone" recenter pill — reframes to the zone-fit region (the
    /// whole area showing all current deals). Never fights manual gestures.
    private var recenterPill: some View {
        Button { reframe(); Haptics.selection() } label: {
            HStack(spacing: 6) {
                Image(systemName: "scope").font(.caption2.weight(.bold))
                Text("Back to Dealy zone").font(.caption.weight(.semibold))
            }
            .foregroundStyle(Theme.primary)
            .padding(.vertical, 8).padding(.horizontal, Spacing.sm)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Theme.primary.opacity(0.25), lineWidth: 1))
            .dealyShadow(.soft)
        }
        .buttonStyle(.plain)
        .padding(Spacing.sm)
        .accessibilityLabel("Back to Dealy zone")
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
                Text("No deals match these filters")
                    .font(.headline).foregroundStyle(Theme.primaryText)
                    .multilineTextAlignment(.center)
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { filter = MapFilterState() }
                    Haptics.selection()
                } label: {
                    InfoChip(symbol: "arrow.counterclockwise", text: "Reset filters", filled: true)
                }
                .buttonStyle(.plain)
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

    // MARK: Deal strip (all filtered deals, lazily rendered, selection-coupled)

    private var dealStrip: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !visible.isEmpty {
                Text("\(visible.count) \(visible.count == 1 ? "deal" : "deals") · \(filter.sort.label)")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.primaryText)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, 8)
            }
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: Spacing.sm) {
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

    /// Drop a stale selection when the filter hides the selected deal.
    private func clampSelection() {
        if let id = selectedID, !visible.contains(where: { $0.id == id }) {
            selectedID = nil
        }
    }

    /// Reframe to the zone-fit region: the whole area showing every visible deal,
    /// capped to the zone box.
    private func reframe() {
        let region = MapCameraModel.zoneFitRegion(center: center, deals: visible)
        withAnimation { position = .region(region) }
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
