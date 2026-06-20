import SwiftUI
import MapKit

/// Dealy+ map PREVIEW. The full interactive deal map is a Dealy+ feature, so the
/// free entry point shows a non-interactive teaser: a few obscured pins, no pan,
/// zoom, pin selection, or "Search this area" — only an unlock call-to-action.
struct DealsMapView: View {
    let deals: [Deal]
    let campus: Campus

    @Environment(\.dismiss) private var dismiss
    @State private var position: MapCameraPosition
    @State private var showUnlock = false

    /// Only physical deals get a pin; online deals have no location.
    private var mappable: [Deal] { deals.filter { !$0.isOnline } }

    init(deals: [Deal], campus: Campus) {
        self.deals = deals
        self.campus = campus
        _position = State(initialValue: .region(MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: campus.latitude, longitude: campus.longitude),
            span: MKCoordinateSpan(latitudeDelta: 0.075, longitudeDelta: 0.075))))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Non-interactive: empty interactionModes disables pan/zoom.
                Map(position: $position, interactionModes: []) {
                    Annotation(campus.shortName,
                               coordinate: CLLocationCoordinate2D(latitude: campus.latitude,
                                                                  longitude: campus.longitude)) {
                        campusPin
                    }
                    .annotationTitles(.hidden)

                    ForEach(Array(mappable.prefix(6))) { deal in
                        Annotation(deal.merchant, coordinate: DealGeo.coordinate(for: deal, around: campus)) {
                            DealMapPin(deal: deal, selected: false)
                        }
                        .annotationTitles(.hidden)
                    }
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .blur(radius: 4)
                .allowsHitTesting(false)        // no pin selection / interaction
                .ignoresSafeArea(edges: .bottom)

                unlockOverlay
            }
            .navigationTitle("Deals map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() } }
            }
            .sheet(isPresented: $showUnlock) { DealyPlusView() }
        }
    }

    private var unlockOverlay: some View {
        VStack(spacing: Spacing.md) {
            Spacer()
            ZStack {
                Circle().fill(Theme.brandGradient).frame(width: 72, height: 72)
                Image(systemName: "map.fill").font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)
            }
            Text("Unlock the full deal map with Dealy+")
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.primaryText)
                .multilineTextAlignment(.center)
            Text("See every nearby deal on an interactive map — pan, zoom, and tap pins to open offers.")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.lg)
            Button("Unlock with Dealy+") { showUnlock = true }
                .buttonStyle(.primaryDealy)
                .padding(.horizontal, Spacing.lg)
            Spacer()
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.ultraThinMaterial)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("The full deal map is a Dealy+ feature. Unlock with Dealy+.")
    }

    private var campusPin: some View {
        ZStack {
            Circle().fill(.white).frame(width: 20, height: 20).dealyShadow(.soft)
            Circle().fill(Theme.primary).frame(width: 12, height: 12)
        }
        .accessibilityHidden(true)
    }
}

/// Map pin: a category-tinted bubble that grows when selected.
private struct DealMapPin: View {
    let deal: Deal
    let selected: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(deal.category.gradient)
                .frame(width: selected ? 46 : 36, height: selected ? 46 : 36)
                .overlay(Circle().stroke(.white, lineWidth: 2.5))
                .dealyShadow(.soft)
            Image(systemName: deal.category.symbol)
                .font(.system(size: selected ? 19 : 15, weight: .bold))
                .foregroundStyle(.white)
        }
        .accessibilityHidden(true)
    }
}
