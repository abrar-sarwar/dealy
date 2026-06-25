import CoreLocation
import SwiftUI

/// A single bounded map marker from the backend `/v1/feeds/places/map` projection.
/// These are real local places (food spots, cafés, hidden gems, …) rendered on the
/// Map ON TOP of the curated deal pins. Some have a real keyless Google photo URL
/// (`primaryPhotoUrl`); when absent the UI falls back to generated `CategoryArtwork`.
struct PlaceMarker: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let category: DealCategory
    let latitude: Double
    let longitude: Double
    let priceBucket: String?
    let rating: Double?
    let whyRecommended: String?
    /// Real remote photo URL (keyless `lh3.googleusercontent.com`), or nil → artwork.
    let primaryPhotoUrl: String?
    let imageStatus: String?
    /// Drives the marker's compact pin glyph + tint (food/cafe/hidden_gem/…).
    let kind: PlaceMarkerKind

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    /// Deterministic seed for `CategoryArtwork`, derived from the stable id so the
    /// same place always renders the same artwork.
    var visualSeed: Int { abs(id.hashValue) % 1000 }
}

/// The map-feed `markerKind` taxonomy. Each kind carries its own SF Symbol + tint
/// so place pins read distinctly from the category-tinted deal pins. Unknown wire
/// values resolve to `.deal` (a neutral, sensible default).
enum PlaceMarkerKind: String, CaseIterable, Equatable, Sendable {
    case food
    case cafe
    case hiddenGem = "hidden_gem"
    case student
    case deal
    case service

    /// Lenient mapping from the wire string; unknown/absent → `.deal`.
    static func from(_ raw: String?) -> PlaceMarkerKind {
        guard let raw, let kind = PlaceMarkerKind(rawValue: raw) else { return .deal }
        return kind
    }

    var symbol: String {
        switch self {
        case .food: return "fork.knife"
        case .cafe: return "cup.and.saucer.fill"
        case .hiddenGem: return "sparkles"
        case .student: return "graduationcap.fill"
        case .deal: return "tag.fill"
        case .service: return "wrench.and.screwdriver.fill"
        }
    }

    var tint: Color {
        switch self {
        case .food: return Color(hex: 0xF97316)        // orange
        case .cafe: return Color(hex: 0x92400E)        // coffee brown
        case .hiddenGem: return Color(hex: 0x8B5CF6)   // violet
        case .student: return Color(hex: 0x2563EB)     // blue
        case .deal: return Color(hex: 0xE11D48)        // rose
        case .service: return Color(hex: 0x475569)     // slate
        }
    }
}

// MARK: - Wire DTO

/// Wire shape of one marker in the `/v1/feeds/places/map` response (a JSON array).
struct PlaceMarkerDTO: Decodable {
    let id: String
    let name: String
    let categorySlug: String?
    let latitude: Double
    let longitude: Double
    let priceBucket: String?
    let rating: Double?
    let whyRecommended: String?
    let primaryPhotoUrl: String?
    let imageStatus: String?
    let markerKind: String?

    /// Map to the domain `PlaceMarker`. Unknown category slugs fall back to `.food`;
    /// unknown marker kinds fall back to `.deal`.
    func toMarker() -> PlaceMarker {
        PlaceMarker(
            id: id,
            name: name,
            category: DealCategory(rawValue: categorySlug ?? "") ?? .food,
            latitude: latitude,
            longitude: longitude,
            priceBucket: priceBucket,
            rating: rating,
            whyRecommended: whyRecommended,
            primaryPhotoUrl: primaryPhotoUrl,
            imageStatus: imageStatus,
            kind: PlaceMarkerKind.from(markerKind)
        )
    }
}
