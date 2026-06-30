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
    /// Gemini money-saving tip ("what to order / how to save here"); nil → hidden.
    let budgetTip: String?
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

    /// The budget tip to render, or nil when there is nothing usable to show — the
    /// preview card binds its tip line to this so an empty/whitespace tip is hidden.
    var budgetTipDisplay: String? {
        guard let tip = budgetTip?.trimmingCharacters(in: .whitespacesAndNewlines),
              !tip.isEmpty else { return nil }
        return tip
    }

    /// Memberwise init with `budgetTip` defaulted to nil so existing call sites
    /// (mock fixtures, tests) that predate the budget-tip upgrade keep compiling.
    init(id: String, name: String, category: DealCategory, latitude: Double,
         longitude: Double, priceBucket: String?, rating: Double?,
         whyRecommended: String?, budgetTip: String? = nil,
         primaryPhotoUrl: String?, imageStatus: String?, kind: PlaceMarkerKind) {
        self.id = id
        self.name = name
        self.category = category
        self.latitude = latitude
        self.longitude = longitude
        self.priceBucket = priceBucket
        self.rating = rating
        self.whyRecommended = whyRecommended
        self.budgetTip = budgetTip
        self.primaryPhotoUrl = primaryPhotoUrl
        self.imageStatus = imageStatus
        self.kind = kind
    }
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
    let budgetTip: String?
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
            budgetTip: budgetTip,
            primaryPhotoUrl: primaryPhotoUrl,
            imageStatus: imageStatus,
            kind: PlaceMarkerKind.from(markerKind)
        )
    }
}
