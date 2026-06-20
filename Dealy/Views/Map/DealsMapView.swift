import SwiftUI
import MapKit
import UIKit

/// Interactive Map tab. A scrollable strip of fresh deals sits above a live map
/// of your nearby deals. The map centers on your ACTUAL device location (When-In-
/// Use); pins scatter around it. Tap a pin to preview, tap the preview for detail.
struct DealsMapView: View {
    @Environment(AppState.self) private var app

    @State private var position: MapCameraPosition = .automatic
    @State private var anchor: CLLocationCoordinate2D?
    @State private var selectedID: String?
    @State private var detailDeal: Deal?
    @State private var isLocating = false

    /// Map center / pin anchor: the real device location once resolved, else the
    /// current discovery center as a fallback.
    private var center: CLLocationCoordinate2D {
        anchor ?? CLLocationCoordinate2D(latitude: app.discovery.center.latitude,
                                         longitude: app.discovery.center.longitude)
    }

    /// Physical (mappable) deals — online deals have no location.
    private var mappable: [Deal] { DealFilter.active(app.allDeals).filter { !$0.isOnline } }

    /// Newest deals for the strip above the map.
    private var freshDeals: [Deal] {
        Array(DealSortOption.mostRecent.sort(DealFilter.active(app.allDeals)).prefix(10))
    }

    private func region() -> MKCoordinateRegion {
        let delta = max(0.03, Double(app.discovery.radiusMiles) * 2.2 / 69.0)
        return MKCoordinateRegion(center: center,
                                  span: MKCoordinateSpan(latitudeDelta: delta, longitudeDelta: delta))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                freshStrip
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
            .sheet(item: $detailDeal) { DealDetailView(deal: $0) }
            .onAppear { resolveLocation(force: false) }
        }
    }

    // MARK: Fresh deals strip

    private var freshStrip: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Fresh deals nearby")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Theme.primaryText)
                .padding(.horizontal, Spacing.lg)
                .padding(.top, 6)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.sm) {
                    ForEach(freshDeals) { deal in
                        freshCard(deal)
                    }
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, 8)
            }
        }
        .background(Theme.background)
    }

    /// Compact horizontal card for the fresh-deals strip (keeps the top small).
    private func freshCard(_ deal: Deal) -> some View {
        Button {
            app.recordOpened(deal.id)
            detailDeal = deal
        } label: {
            HStack(spacing: Spacing.sm) {
                CategoryArtwork(category: deal.category, seed: deal.visualSeed)
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
            .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).stroke(Theme.separator, lineWidth: 0.75))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens deal details")
    }

    // MARK: Map

    private var mapArea: some View {
        Map(position: $position) {
            Annotation("You", coordinate: center) { centerPin }
                .annotationTitles(.hidden)

            ForEach(mappable) { deal in
                Annotation(deal.merchant, coordinate: DealGeo.coordinate(for: deal, around: center)) {
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
        .mapControls { MapCompass() }
        .overlay(alignment: .top) { VStack(spacing: Spacing.xs) { permissionBanner; topNote } }
        .overlay(alignment: .bottom) { selectedCard }
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

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private var centerPin: some View {
        ZStack {
            Circle().fill(Theme.primary.opacity(0.25)).frame(width: 30, height: 30)
            Circle().fill(.white).frame(width: 18, height: 18).dealyShadow(.soft)
            Circle().fill(Theme.primary).frame(width: 11, height: 11)
        }
        .accessibilityLabel("Your location")
    }

    @ViewBuilder private var topNote: some View {
        if !mappable.isEmpty {
            Text("Approximate locations · \(mappable.count) deals")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Theme.mutedText)
                .padding(.vertical, 6).padding(.horizontal, Spacing.sm)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.top, Spacing.xs)
        }
    }

    @ViewBuilder private var selectedCard: some View {
        if let id = selectedID, let deal = mappable.first(where: { $0.id == id }) {
            DealRowCard(deal: deal) {
                app.recordOpened(deal.id)
                detailDeal = deal
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.sm)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    @ViewBuilder private var emptyOverlay: some View {
        if mappable.isEmpty {
            VStack(spacing: Spacing.sm) {
                Image(systemName: "mappin.slash")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Theme.mutedText)
                Text("No deals to map here")
                    .font(.headline).foregroundStyle(Theme.primaryText)
                Text(app.discovery.mode == .anywhere
                     ? "Online deals don’t have a location. Switch to Nearby to see deals on the map."
                     : "No nearby physical deals at this radius. Widen your range from the Home filter.")
                    .font(.subheadline).foregroundStyle(Theme.mutedText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.xl)
            }
            .padding(Spacing.lg)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg))
            .padding(Spacing.lg)
        }
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
            withAnimation { position = .region(region()) }
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
