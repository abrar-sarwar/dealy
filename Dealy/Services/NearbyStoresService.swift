import CoreLocation
import Foundation
import MapKit

/// A physical store where an online student deal can be redeemed in person.
struct NearbyStore: Identifiable, Equatable {
    let id: String
    let name: String
    let address: String
    let distanceMiles: Double
    let phone: String?
    let url: URL?
    let latitude: Double
    let longitude: Double
}

/// Finds physical stores for a brand near a coordinate. Protocol-abstracted so
/// tests/previews never touch real MapKit.
protocol NearbyStoreSearching {
    func search(brand: String, near coordinate: CLLocationCoordinate2D) async throws -> [NearbyStore]
}

/// Pure helpers, unit-tested without MapKit.
enum NearbyStores {
    /// Build a `NearbyStore`, computing great-circle distance from `origin`.
    static func make(name: String, address: String, phone: String?, url: URL?,
                     lat: Double, lng: Double, origin: CLLocationCoordinate2D) -> NearbyStore {
        let meters = CLLocation(latitude: lat, longitude: lng)
            .distance(from: CLLocation(latitude: origin.latitude, longitude: origin.longitude))
        return NearbyStore(
            id: "\(name)|\(lat),\(lng)",
            name: name,
            address: address,
            distanceMiles: meters / 1609.344,
            phone: phone,
            url: url,
            latitude: lat,
            longitude: lng
        )
    }

    /// Nearest-first, with a stable id tiebreak.
    static func sortedByDistance(_ stores: [NearbyStore]) -> [NearbyStore] {
        stores.sorted {
            $0.distanceMiles != $1.distanceMiles ? $0.distanceMiles < $1.distanceMiles : $0.id < $1.id
        }
    }
}

/// Live MapKit implementation — the only untested shell.
final class MapKitNearbyStoresService: NearbyStoreSearching {
    func search(brand: String, near coordinate: CLLocationCoordinate2D) async throws -> [NearbyStore] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = brand
        request.region = MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.4, longitudeDelta: 0.4)
        )
        let response = try await MKLocalSearch(request: request).start()
        let stores = response.mapItems.compactMap { item -> NearbyStore? in
            let c = item.placemark.coordinate
            guard CLLocationCoordinate2DIsValid(c) else { return nil }
            return NearbyStores.make(
                name: item.name ?? brand,
                address: item.placemark.title ?? "",
                phone: item.phoneNumber,
                url: item.url,
                lat: c.latitude,
                lng: c.longitude,
                origin: coordinate
            )
        }
        return NearbyStores.sortedByDistance(stores)
    }
}

/// Deterministic double for tests/previews.
struct MockNearbyStoresService: NearbyStoreSearching {
    var stores: [NearbyStore] = []
    func search(brand: String, near coordinate: CLLocationCoordinate2D) async throws -> [NearbyStore] {
        NearbyStores.sortedByDistance(stores)
    }
}
