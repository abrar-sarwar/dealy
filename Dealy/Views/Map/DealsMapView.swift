import SwiftUI
import MapKit
import UIKit

/// Local-deal browser BOUNDED to the Dealy service zone, built around an
/// always-visible RADIUS SLIDER as its primary control. Dragging the slider resizes
/// the live range ring (`MapCircle`), refilters the pins + bottom strip, and
/// reframes the camera to fit the radius — always capped by the zone box so the
/// map never opens metro-wide. Everything else (category, precision, sort,
/// student/campus/image toggles) lives behind the quiet Filters button + sheet.
/// Tapping a pin selects it and scrolls the strip to the matching card; the two
/// stay in sync. Pins are category- and precision-aware (exact = solid, approximate
/// = faded + dashed). The camera cannot pan/zoom out past the metro.
struct DealsMapView: View {
    @Environment(AppState.self) private var app

    @State private var position: MapCameraPosition = .automatic
    @State private var anchor: CLLocationCoordinate2D?
    @State private var selectedID: String?
    /// Selected place marker (separate from the deal-pin selection so the two never
    /// collide). Drives the place-preview card overlay; selecting one clears the other.
    @State private var selectedPlaceID: String?
    @State private var detailDeal: Deal?
    @State private var isLocating = false
    /// In-app directions route drawn on the map (no app switch). Set by tapping a
    /// place's Directions; cleared by the route banner's close.
    @State private var route: MKRoute?
    @State private var routeName: String?
    @State private var routeDestination: CLLocationCoordinate2D?

    /// The signature control: a top-level map value (NOT a sheet filter). Drives
    /// the ring, the visible set, and the camera. Defaults to the widest (show all).
    @State private var radiusMiles: Int = 5
    /// Continuous slider backing value; snaps to whole miles in `radiusMiles`.
    @State private var radiusRaw: Double = 5

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

    /// Deals matching the sheet filters (category + toggles), BEFORE radius. Used to
    /// scope the slider's live count to the active filters.
    private var filteredAll: [Deal] { filter.apply(to: mappableAll) }

    /// The deals shown on the map + strip: sheet filters, then within the slider's
    /// radius, ordered by the active sort.
    private var visible: [Deal] {
        let scoped = MapCameraModel.within(filteredAll, radiusMiles: radiusMiles)
        let ranked = DealRanker.diversified(
            DealRanker.rank(scoped,
                            interests: app.interests,
                            campus: app.currentCampus,
                            radius: radiusMiles))
        return filter.sort.ordered(scoped, ranked: ranked)
    }

    private var countLabel: MapCameraModel.CountLabel {
        MapCameraModel.countLabel(shown: visible, totalMappable: mappableAll)
    }

    /// Place markers (backend, bounded ≤40) within the current slider radius of the
    /// user, so the place pins track the spotlight bubble and don't clutter the map.
    private var visibleMarkers: [PlaceMarker] {
        MapCameraModel.markersWithin(app.placeMarkers, center: center, radiusMiles: radiusMiles)
    }

    /// The currently-selected place marker (if still visible), backing the preview card.
    private var selectedPlace: PlaceMarker? {
        guard let id = selectedPlaceID else { return nil }
        return visibleMarkers.first { $0.id == id }
    }

    /// Bounds: the camera is locked to the CURRENT RADIUS bubble — the user cannot
    /// pan or zoom out beyond the selected range. Tighten/widen the slider and the
    /// allowed area follows. No metro-wide free roaming.
    private var cameraBounds: MapCameraBounds {
        MapCameraBounds(
            centerCoordinateBounds: MapCameraModel.spotlightRegion(center: center, radiusMiles: radiusMiles),
            maximumDistance: MapCameraModel.radiusMeters(radiusMiles) * 5.5
        )
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                dealStrip
                mapArea
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
                await app.loadPlaceMarkers()
                frameToRadius()
            }
            .onChange(of: filter) { _, _ in clampSelection(); frameToRadius() }
            // radiusMiles is the single source of truth (shared by the map slider AND
            // the Filters sheet). The continuous slider writes it; the sheet writes it;
            // this one handler reframes + re-filters so both stay in lockstep.
            .onChange(of: radiusRaw) { _, raw in
                let snapped = MapCameraModel.snapRadius(raw)
                if snapped != radiusMiles { radiusMiles = snapped }
            }
            .onChange(of: radiusMiles) { _, v in
                if MapCameraModel.snapRadius(radiusRaw) != v { radiusRaw = Double(v) } // sync slider thumb when changed from the sheet
                Haptics.selection()
                clampSelection()
                frameToRadius()
            }
        }
    }

    // MARK: Map

    private var mapArea: some View {
        // interactionModes [] LOCKS the camera to the user's location: no manual
        // pan/zoom, so the centered spotlight bubble always stays on you. The radius
        // slider is the only thing that changes the view.
        Map(position: $position, bounds: cameraBounds, interactionModes: []) {
            Annotation("You", coordinate: center) { centerPin }
                .annotationTitles(.hidden)

            ForEach(visible) { deal in
                Annotation(deal.merchant, coordinate: DealGeo.coordinate(for: deal, around: center)) {
                    DealMapPin(deal: deal, selected: selectedID == deal.id)
                        .onTapGesture { select(deal.id) }
                }
                .annotationTitles(.hidden)
            }

            // Place markers render AFTER (on top of) the deal pins. They sit under the
            // spotlight overlay (clear inside the bubble, dimmed outside) — intended.
            ForEach(visibleMarkers) { marker in
                Annotation(marker.name, coordinate: marker.coordinate) {
                    PlaceMapPin(marker: marker, selected: selectedPlaceID == marker.id)
                        .onTapGesture { selectPlace(marker.id) }
                }
                .annotationTitles(.hidden)
            }

            // In-app directions: the route drawn right on the Dealy map.
            if let route {
                MapPolyline(route.polyline)
                    .stroke(Theme.primary, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
            }
            if let dest = routeDestination {
                Annotation("Destination", coordinate: dest) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title2).foregroundStyle(Theme.primary)
                        .background(Circle().fill(.white).padding(2))
                }
                .annotationTitles(.hidden)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls { MapCompass() }
        // Spotlight: dim everything OUTSIDE the radius bubble. The camera frames the
        // bubble centered (spotlightRegion), so a centered circular cutout aligns with
        // the range. Sits under the chrome overlays (slider/filters stay bright).
        .overlay { spotlightMask }
        .overlay(alignment: .top) { permissionBanner }
        .overlay(alignment: .top) { routeBanner }
        .overlay(alignment: .topLeading) { filterButton }
        .overlay(alignment: .topTrailing) { countOverlay }
        .overlay(alignment: .bottom) { placePreviewCard }
        .overlay(alignment: .bottom) { radiusSlider }
        .overlay(alignment: .bottomTrailing) { recenterPill }
        .overlay { emptyOverlay }
    }

    /// Dims everything outside the radius bubble (a centered circular hole) so only
    /// what's inside reads clearly; bright ring marks the edge. Screen-space, but the
    /// camera keeps the bubble centered so it lines up with the range.
    private var spotlightMask: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let diameter = side * 0.62
            let r = diameter / 2
            ZStack {
                // Frosted "locked" blur OUTSIDE the bubble — a teaser, like you'd pay to
                // unlock the rest. The material blurs the map behind it; a radial mask
                // keeps the bubble crisp and feathers the blur in softly at the edge.
                ZStack {
                    Rectangle().fill(.ultraThinMaterial)
                    Color.black.opacity(0.12)
                }
                .compositingGroup()
                .mask(
                    RadialGradient(
                        gradient: Gradient(stops: [
                            .init(color: .clear, location: 0.0),
                            .init(color: .clear, location: 0.84),
                            .init(color: .black, location: 1.0),
                        ]),
                        center: .center,
                        startRadius: 0,
                        endRadius: r * 1.16
                    )
                )
                Circle()
                    .stroke(Theme.primary.opacity(0.85), lineWidth: 2.5)
                    .frame(width: diameter, height: diameter)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .allowsHitTesting(false)
    }

    // MARK: Radius slider — the signature control

    /// Always-visible, compact slider docked at the bottom of the map. Continuous
    /// 1–15 mi, snapping to whole miles; live label; haptic tick per integer step.
    private var radiusSlider: some View {
        VStack(spacing: 6) {
            HStack {
                Label(MapCameraModel.radiusLabel(radiusMiles: radiusMiles, filtered: filteredAll),
                      systemImage: "scope")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.primaryText)
                Spacer()
            }
            HStack(spacing: Spacing.sm) {
                Text("\(MapCameraModel.minRadiusMiles)")
                    .font(.caption2.weight(.semibold)).foregroundStyle(Theme.mutedText)
                Slider(
                    value: $radiusRaw,
                    in: Double(MapCameraModel.minRadiusMiles)...Double(MapCameraModel.maxRadiusMiles),
                    step: 1
                ) {
                    Text("Radius")
                } minimumValueLabel: { EmptyView() } maximumValueLabel: { EmptyView() }
                    .tint(Theme.primary)
                Text("\(MapCameraModel.maxRadiusMiles)")
                    .font(.caption2.weight(.semibold)).foregroundStyle(Theme.mutedText)
            }
        }
        .padding(.vertical, 10).padding(.horizontal, Spacing.md)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
            .stroke(Theme.primary.opacity(0.2), lineWidth: 1))
        .dealyShadow(.soft)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.sm)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Search radius")
        .accessibilityValue(MapCameraModel.radiusLabel(radiusMiles: radiusMiles, filtered: filteredAll))
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

    /// "Back to my area" recenter pill — reframes to fit the current radius around
    /// the user. Never fights manual gestures.
    private var recenterPill: some View {
        Button { frameToRadius(); Haptics.selection() } label: {
            HStack(spacing: 6) {
                Image(systemName: "location.fill").font(.caption2.weight(.bold))
                Text("Back to my area").font(.caption.weight(.semibold))
            }
            .foregroundStyle(Theme.primary)
            .padding(.vertical, 8).padding(.horizontal, Spacing.sm)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Theme.primary.opacity(0.25), lineWidth: 1))
            .dealyShadow(.soft)
        }
        .buttonStyle(.plain)
        .padding(.trailing, Spacing.sm)
        // Sit above the slider so the two don't collide at the bottom edge.
        .padding(.bottom, 96)
        .accessibilityLabel("Back to my area")
    }

    private var centerPin: some View {
        ZStack {
            Circle().fill(Theme.primary.opacity(0.25)).frame(width: 30, height: 30)
            Circle().fill(.white).frame(width: 18, height: 18).dealyShadow(.soft)
            Circle().fill(Theme.primary).frame(width: 11, height: 11)
        }
        .accessibilityLabel("Your location")
    }

    // MARK: Place preview card

    /// Compact preview card for the selected place marker. Sits above the bottom
    /// slider (extra bottom inset) so it never overlaps the radius control. Shows the
    /// photo (real → artwork fallback), name, meta, why-recommended, and Directions.
    @ViewBuilder private var placePreviewCard: some View {
        if let place = selectedPlace {
            PlacePreviewCard(
                marker: place,
                onDirections: {
                    showRoute(to: place.coordinate, name: place.name)
                    Haptics.selection()
                },
                onClose: { dismissPlace() }
            )
            .padding(.horizontal, Spacing.lg)
            // Clear the bottom slider (its docked height + padding ≈ 108pt).
            .padding(.bottom, 112)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    /// In-app directions banner: ETA + distance to the routed place, an "Open in Maps"
    /// hand-off, and a close that clears the drawn route.
    @ViewBuilder private var routeBanner: some View {
        if let route, let name = routeName {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    .foregroundStyle(Theme.primary)
                VStack(alignment: .leading, spacing: 1) {
                    Text(MapCameraModel.routeSummary(distanceMeters: route.distance,
                                                     etaSeconds: route.expectedTravelTime))
                        .font(.subheadline.weight(.bold)).foregroundStyle(Theme.primaryText)
                    Text("to \(name)").font(.caption2).foregroundStyle(Theme.mutedText).lineLimit(1)
                }
                Spacer()
                if let dest = routeDestination {
                    Button { DirectionsLauncher.open(to: dest, name: name); Haptics.selection() } label: {
                        Text("Open in Maps").font(.caption.weight(.semibold))
                    }.buttonStyle(.plain).foregroundStyle(Theme.primary)
                }
                Button { clearRoute() } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.mutedText)
                }.buttonStyle(.plain)
            }
            .padding(.vertical, 8).padding(.horizontal, Spacing.sm)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).stroke(Theme.primary.opacity(0.25), lineWidth: 1))
            .dealyShadow(.soft)
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.xs)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    @ViewBuilder private var emptyOverlay: some View {
        if MapCameraModel.isRadiusEmpty(shown: visible, totalMappable: mappableAll) {
            // Honest empty state: the radius + filters hide everything, but the area
            // has inventory. Point at the (still-visible) slider and the Filters sheet.
            VStack(spacing: Spacing.sm) {
                Image(systemName: "mappin.slash")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Theme.mutedText)
                Text("No deals within \(radiusMiles) mi")
                    .font(.headline).foregroundStyle(Theme.primaryText)
                    .multilineTextAlignment(.center)
                Text("Drag the slider to widen\(filter.isDefault ? "" : ", or change Filters")")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedText)
                    .multilineTextAlignment(.center)
                if radiusMiles < MapCameraModel.maxRadiusMiles {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            radiusRaw = Double(MapCameraModel.maxRadiusMiles)
                        }
                    } label: {
                        InfoChip(symbol: "arrow.left.and.right",
                                 text: "Widen to \(MapCameraModel.maxRadiusMiles) mi", filled: true)
                    }
                    .buttonStyle(.plain)
                } else if !filter.isDefault {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { filter = MapFilterState() }
                        Haptics.selection()
                    } label: {
                        InfoChip(symbol: "arrow.counterclockwise", text: "Reset filters", filled: true)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(Spacing.lg)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg))
            .padding(Spacing.lg)
            // Keep clear of the bottom slider.
            .padding(.bottom, 120)
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
        VStack(alignment: .leading, spacing: 2) {
            if !visible.isEmpty {
                HStack(spacing: 5) {
                    Image(systemName: "flame.fill").font(.caption2).foregroundStyle(.orange)
                    Text("Limited Deals!")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(Theme.primaryText)
                    Text("· \(visible.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.mutedText)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.top, 4)
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
                    .padding(.vertical, 6)
                }
                .onChange(of: selectedID) { _, id in
                    guard let id else { return }
                    withAnimation(.easeInOut) { proxy.scrollTo(id, anchor: .center) }
                }
                // Pin the strip to one card row — without this the horizontal
                // ScrollView expands to fill all the leftover vertical space (the
                // "big empty box"). The map takes everything below.
                .frame(height: 62)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
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
            HStack(spacing: Spacing.xs) {
                DealImage(deal: deal)
                    .frame(width: 38, height: 38)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(deal.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(1)
                    // One compact info line: merchant · distance (honest) · price, with
                    // ending-soon / student-ID as trailing icons.
                    HStack(spacing: 3) {
                        Text(deal.merchant).lineLimit(1)
                        if !deal.isOnline {
                            Text("·")
                            Text(deal.isExactLocation
                                 ? Format.distance(deal.distanceMiles, isOnline: false)
                                 : "Nearby")
                        }
                        if deal.hasFixedPricing {
                            Text(Format.price(deal.currentPrice)).foregroundStyle(Theme.primary)
                        }
                        if deal.isEndingSoon() { Image(systemName: "clock.fill").foregroundStyle(.orange) }
                        if deal.requiresStudentId { Image(systemName: "graduationcap.fill").foregroundStyle(Theme.primary) }
                    }
                    .font(.caption2)
                    .foregroundStyle(Theme.mutedText)
                    .lineLimit(1)
                }
                .frame(width: 120, alignment: .leading)
            }
            .padding(6)
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
            // Selecting a deal clears any place selection so the two stay coherent.
            if selectedID != nil { selectedPlaceID = nil }
        }
        Haptics.selection()
    }

    /// Select a place marker (toggling off if re-tapped). Clears the deal selection
    /// so the two never show simultaneously; drives the place-preview card.
    private func selectPlace(_ id: String) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            selectedPlaceID = (selectedPlaceID == id) ? nil : id
            if selectedPlaceID != nil { selectedID = nil }
        }
        Haptics.selection()
    }

    private func dismissPlace() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { selectedPlaceID = nil }
    }

    /// Compute an in-app driving route from the user's location to the place and draw
    /// it on the Dealy map — no app switch. "Open in Maps" in the banner is the hand-off.
    private func showRoute(to dest: CLLocationCoordinate2D, name: String) {
        routeName = name
        routeDestination = dest
        dismissPlace()
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: center))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: dest))
        request.transportType = .automobile
        MKDirections(request: request).calculate { response, _ in
            guard let first = response?.routes.first else { return }
            withAnimation(.easeInOut) { route = first }
        }
    }

    private func clearRoute() {
        withAnimation(.easeInOut) {
            route = nil
            routeName = nil
            routeDestination = nil
        }
        Haptics.selection()
    }

    /// Drop a stale selection when the filter/radius hides the selected deal or place.
    private func clampSelection() {
        if let id = selectedID, !visible.contains(where: { $0.id == id }) {
            selectedID = nil
        }
        if let id = selectedPlaceID, !visibleMarkers.contains(where: { $0.id == id }) {
            selectedPlaceID = nil
        }
    }

    /// Reframe to fit the current slider radius around the user — the camera tracks
    /// the ring. Span is capped to the zone box by `MapCameraModel.span`.
    private func frameToRadius() {
        let region = MapCameraModel.spotlightRegion(center: center, radiusMiles: radiusMiles)
        withAnimation(.easeInOut(duration: 0.25)) { position = .region(region) }
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
            frameToRadius()
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

/// Compact, kind-tinted place pin — a smaller teardrop, deliberately distinct from
/// the round category-gradient deal pins, so real places read as a separate layer.
/// Grows + brightens when selected.
private struct PlaceMapPin: View {
    let marker: PlaceMarker
    let selected: Bool

    private var size: CGFloat { selected ? 34 : 26 }
    private var iconSize: CGFloat { selected ? 15 : 12 }

    var body: some View {
        ZStack {
            Circle()
                .fill(marker.kind.tint)
                .frame(width: size, height: size)
                .overlay(Circle().stroke(.white, lineWidth: selected ? 2.5 : 1.5))
                .shadow(color: .black.opacity(0.25), radius: selected ? 4 : 2, y: 1)
            Image(systemName: marker.kind.symbol)
                .font(.system(size: iconSize, weight: .bold))
                .foregroundStyle(.white)
        }
        .accessibilityLabel("\(marker.name), place")
        .accessibilityHint("Shows a preview with directions")
    }
}

/// Compact place-preview card shown over the map when a place marker is tapped.
/// Photo (real → `CategoryArtwork` fallback) + name + meta + why-recommended +
/// a Directions button. Lives above the bottom slider, not under the controls.
private struct PlacePreviewCard: View {
    let marker: PlaceMarker
    var onDirections: () -> Void
    var onClose: () -> Void

    /// "{priceBucket} · ★{rating} · {category}" — omits absent parts cleanly.
    private var metaLine: String {
        var parts: [String] = []
        if let bucket = marker.priceBucket, !bucket.isEmpty { parts.append(bucket) }
        if let rating = marker.rating { parts.append(String(format: "★%.1f", rating)) }
        parts.append(marker.category.displayName)
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            PlaceImage(photoURL: marker.primaryPhotoUrl,
                       category: marker.category, seed: marker.visualSeed)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(marker.name)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.primaryText)
                    .lineLimit(1)
                Text(metaLine)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Theme.mutedText)
                    .lineLimit(1)
                if let why = marker.whyRecommended, !why.isEmpty {
                    Text(why)
                        .font(.caption2)
                        .foregroundStyle(Theme.mutedText)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Button(action: onDirections) {
                    HStack(spacing: 5) {
                        Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                        Text("Directions")
                    }
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.vertical, 6).padding(.horizontal, Spacing.sm)
                    .background(Theme.primary, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
                .accessibilityLabel("Directions to \(marker.name)")
            }

            Spacer(minLength: 0)

            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(Theme.mutedText)
                    .symbolRenderingMode(.hierarchical)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss preview")
        }
        .padding(Spacing.sm)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
            .stroke(marker.kind.tint.opacity(0.35), lineWidth: 1))
        .dealyShadow(.soft)
        .accessibilityElement(children: .contain)
    }
}
