import SwiftUI
import MapKit
import CoreLocation

/// Presents physical stores near the user where an online student deal can be
/// redeemed in person. Map header + list (Call / Website / Directions). Opening
/// hours are deferred to Apple Maps via Directions — never fabricated.
struct NearbyStoresSheet: View {
    let brand: String
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var phase: Phase = .loading

    enum Phase: Equatable {
        case loading
        case loaded([NearbyStore])
        case empty
        case noLocation
        case failed
    }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading:
                    ProgressView("Finding \(brand) stores…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .loaded(let stores):
                    loaded(stores)
                case .empty:
                    EmptyStateView(symbol: "mappin.slash",
                                   title: "No \(brand) stores nearby",
                                   message: "We couldn’t find a \(brand) near you. Try the online link instead.")
                case .noLocation:
                    EmptyStateView(symbol: "location.slash",
                                   title: "Location needed",
                                   message: "Enable location so we can find \(brand) stores near you.")
                case .failed:
                    EmptyStateView(symbol: "exclamationmark.triangle",
                                   title: "Couldn’t search",
                                   message: "Something went wrong finding nearby stores. Try again.")
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Nearby \(brand)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Close") { dismiss() } }
            }
            .task { await load() }
        }
    }

    @ViewBuilder private func loaded(_ stores: [NearbyStore]) -> some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                Map {
                    ForEach(stores) { store in
                        Marker(store.name, coordinate: CLLocationCoordinate2D(
                            latitude: store.latitude, longitude: store.longitude))
                    }
                }
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

                LazyVStack(spacing: Spacing.sm) {
                    ForEach(stores) { store in NearbyStoreRow(store: store) }
                }
            }
            .padding(Spacing.lg)
        }
    }

    private func load() async {
        guard let origin = await resolveOrigin() else {
            phase = .noLocation
            return
        }
        do {
            let stores = try await app.nearbyStores.search(brand: brand, near: origin)
            phase = stores.isEmpty ? .empty : .loaded(stores)
        } catch {
            phase = .failed
        }
    }

    /// Prefer a real device fix; fall back to a fresh one-shot; nil if unavailable.
    private func resolveOrigin() async -> CLLocationCoordinate2D? {
        let center = app.discovery.center
        if center.source == .device {
            return CLLocationCoordinate2D(latitude: center.latitude, longitude: center.longitude)
        }
        if let fix = try? await app.resolveDeviceCenter() {
            return CLLocationCoordinate2D(latitude: fix.latitude, longitude: fix.longitude)
        }
        return nil
    }
}

private struct NearbyStoreRow: View {
    let store: NearbyStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack {
                Text(store.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                Spacer()
                Text(Format.distance(store.distanceMiles, isOnline: false))
                    .font(.caption)
                    .foregroundStyle(Theme.mutedText)
            }
            if !store.address.isEmpty {
                Text(store.address)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedText)
            }
            HStack(spacing: Spacing.md) {
                if let phone = store.phone,
                   let url = URL(string: "tel://\(phone.filter { $0.isNumber })") {
                    Button { openURL(url) } label: { Label("Call", systemImage: "phone.fill") }
                }
                if let url = store.url {
                    Button { openURL(url) } label: { Label("Website", systemImage: "safari.fill") }
                }
                Button { openInMaps() } label: {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.primary)
            .padding(.top, 2)
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .dealyCardSurface()
    }

    private func openInMaps() {
        let coordinate = CLLocationCoordinate2D(latitude: store.latitude, longitude: store.longitude)
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = store.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
    }
}
