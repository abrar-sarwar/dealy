import Foundation

/// A single enriched local business surfaced in the Explore "local savings feed".
/// Sourced from the backend `/v1/feeds/places` projection — places have no remote
/// image, so the UI renders generated `CategoryArtwork`.
struct Place: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let category: DealCategory
    let priceBucket: String?
    let rating: Double?
    let whyRecommended: String?
    let bestFor: String?
    let address: String?
    let latitude: Double?
    let longitude: Double?
    let vibeTags: [String]
    let studentValueScore: Double?
    let confidenceLabel: String?

    /// Deterministic seed for `CategoryArtwork`, derived from the stable id so the
    /// same place always renders the same artwork.
    var visualSeed: Int {
        abs(id.hashValue) % 1000
    }

    /// Whether this place can be navigated to (has resolvable coordinates).
    var hasCoordinates: Bool {
        latitude != nil && longitude != nil
    }
}

/// A ranked section of places (cheap eats, hidden gems, …) for the Explore feed.
struct PlaceFeedSection: Identifiable, Equatable, Sendable {
    /// Stable backend key (e.g. "cheap_eats"); also the SwiftUI identity.
    let key: String
    let title: String
    let places: [Place]

    var id: String { key }

    /// User-facing section title. The backend titles a region-anchored section as
    /// "… near <region>"; locally we always present it as "… near you".
    var displayTitle: String {
        Self.localizedNearYou(title)
    }

    /// Replaces a trailing "near <region-slug>" with "near you" so the feed reads
    /// naturally regardless of which region resolved. Leaves other titles intact.
    static func localizedNearYou(_ title: String) -> String {
        guard let range = title.range(of: "near ", options: [.caseInsensitive, .backwards]) else {
            return title
        }
        // Only rewrite when "near " is followed by a single trailing token (the
        // region slug), not arbitrary mid-sentence text.
        let tail = title[range.upperBound...]
        guard !tail.isEmpty, !tail.contains(" ") else { return title }
        return title.replacingCharacters(in: range.lowerBound..<title.endIndex, with: "near you")
    }
}

// MARK: - Wire DTOs

/// Wire shape of one place card in the `/v1/feeds/places` response.
struct PlaceCardDTO: Decodable {
    let id: String
    let name: String
    let categorySlug: String?
    let priceBucket: String?
    let rating: Double?
    let whyRecommended: String?
    let bestFor: String?
    let address: String?
    let latitude: Double?
    let longitude: Double?
    let vibeTags: [String]?
    let studentValueScore: Double?
    let confidenceLabel: String?

    /// Map to the domain `Place`. Unknown/absent category slugs fall back to `.food`.
    func toPlace() -> Place {
        Place(
            id: id,
            name: name,
            category: DealCategory(rawValue: categorySlug ?? "") ?? .food,
            priceBucket: priceBucket,
            rating: rating,
            whyRecommended: whyRecommended,
            bestFor: bestFor,
            address: address,
            latitude: latitude,
            longitude: longitude,
            vibeTags: vibeTags ?? [],
            studentValueScore: studentValueScore,
            confidenceLabel: confidenceLabel
        )
    }
}

/// Wire shape of one section in the `/v1/feeds/places` response (a JSON array of these).
struct PlaceFeedSectionDTO: Decodable {
    let key: String
    let title: String
    let places: [PlaceCardDTO]

    func toSection() -> PlaceFeedSection {
        PlaceFeedSection(key: key, title: title, places: places.map { $0.toPlace() })
    }
}
