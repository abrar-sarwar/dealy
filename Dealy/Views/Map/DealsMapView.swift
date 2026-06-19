import SwiftUI
import MapKit

/// Full-screen map of nearby deals, scattered around the current campus.
/// Tapping a pin reveals a card; tapping the card opens full detail.
struct DealsMapView: View {
    let deals: [Deal]
    let campus: Campus

    @Environment(\.dismiss) private var dismiss
    @State private var position: MapCameraPosition
    @State private var selectedID: String?
    @State private var detailDeal: Deal?

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
            Map(position: $position) {
                Annotation(campus.shortName,
                           coordinate: CLLocationCoordinate2D(latitude: campus.latitude,
                                                              longitude: campus.longitude)) {
                    campusPin
                }
                .annotationTitles(.hidden)

                ForEach(mappable) { deal in
                    Annotation(deal.merchant, coordinate: DealGeo.coordinate(for: deal, around: campus)) {
                        DealMapPin(deal: deal, selected: selectedID == deal.id)
                            .onTapGesture {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    selectedID = (selectedID == deal.id) ? nil : deal.id
                                }
                                Haptics.selection()
                            }
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .top) { approximateNote }
            .overlay(alignment: .bottom) { selectedCard }
            .navigationTitle("Deals nearby")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() } }
            }
            .sheet(item: $detailDeal) { DealDetailView(deal: $0) }
        }
    }

    private var campusPin: some View {
        ZStack {
            Circle().fill(.white).frame(width: 20, height: 20).dealyShadow(.soft)
            Circle().fill(Theme.primary).frame(width: 12, height: 12)
        }
        .accessibilityLabel("\(campus.shortName) campus")
    }

    @ViewBuilder private var approximateNote: some View {
        Text("Approximate locations · \(mappable.count) deals")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Theme.mutedText)
            .padding(.vertical, 6).padding(.horizontal, Spacing.sm)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.top, Spacing.xs)
    }

    @ViewBuilder private var selectedCard: some View {
        if let id = selectedID, let deal = mappable.first(where: { $0.id == id }) {
            DealRowCard(deal: deal) { detailDeal = deal }
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.sm)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
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
        .accessibilityLabel("\(deal.title) at \(deal.merchant)")
    }
}
