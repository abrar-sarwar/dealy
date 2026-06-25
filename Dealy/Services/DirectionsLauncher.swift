import Foundation
import MapKit
import CoreLocation

/// Maps app to launch directions in. Only Apple Maps is wired today; the enum
/// exists so a `.google` case (or others) can be added without touching callers.
enum MapsProvider {
    case apple
}

/// Small, structured launcher for turn-by-turn directions to a deal's
/// storefront. The `url(to:name:provider:)` builder is pure and testable; the
/// `open` variant uses `MKMapItem.openInMaps` so it reuses the system's native
/// directions UX (mirrors `NearbyStoresSheet`'s `openInMaps`).
enum DirectionsLauncher {

    /// Builds the directions URL for `provider`. Used directly for testing and
    /// as a fallback launch path. For Apple Maps this is the documented
    /// `maps.apple.com` deep link with a destination pin + driving directions.
    static func url(to coord: CLLocationCoordinate2D,
                    name: String,
                    provider: MapsProvider = .apple) -> URL {
        switch provider {
        case .apple:
            var components = URLComponents()
            components.scheme = "https"
            components.host = "maps.apple.com"
            components.path = "/"
            components.queryItems = [
                // `daddr` = destination, `dirflg=d` = driving directions.
                URLQueryItem(name: "ll", value: "\(coord.latitude),\(coord.longitude)"),
                URLQueryItem(name: "q", value: name),
                URLQueryItem(name: "daddr", value: "\(coord.latitude),\(coord.longitude)"),
                URLQueryItem(name: "dirflg", value: "d")
            ]
            // Always parseable given the fixed structure above.
            return components.url!
        }
    }

    /// Opens directions to `coord` in the chosen maps app. Apple Maps uses the
    /// native `MKMapItem` directions launch; other providers fall back to their
    /// URL via the system handler.
    static func open(to coord: CLLocationCoordinate2D,
                     name: String,
                     provider: MapsProvider = .apple) {
        switch provider {
        case .apple:
            let item = MKMapItem(placemark: MKPlacemark(coordinate: coord))
            item.name = name
            item.openInMaps(launchOptions: [
                MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
            ])
        }
    }
}
