import Foundation

/// A single enriched local business surfaced in the Explore "local savings feed".
/// Sourced from the backend `/v1/feeds/places` projection — places have no remote
/// image, so the UI renders generated `CategoryArtwork`.
///
/// `Codable`/`Hashable` so places can be persisted (saved Food Run places) and
/// carried as ranked Food Run alternatives.
struct Place: Identifiable, Equatable, Hashable, Codable, Sendable {
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
    /// Gemini money-saving tip ("what to order / how to save here for your budget").
    /// nil when the place has no tip — the UI hides the tip line in that case.
    let budgetTip: String?
    /// Real remote photo URL (keyless `lh3.googleusercontent.com`) when the place has
    /// a resolved image — a real place/food photo, NOT a logo. nil → `CategoryArtwork`.
    let primaryPhotoUrl: String?
    let imageStatus: String?
    /// Straight-line distance from the user, when the backend knows it (Food Run).
    /// nil for the Explore places feed where distance is not projected.
    let distanceMiles: Double?
    /// Short display tags ("under $10", "good for students", …). Empty when none.
    let tags: [String]

    /// Deterministic seed for `CategoryArtwork`, derived from the stable id so the
    /// same place always renders the same artwork.
    var visualSeed: Int {
        abs(id.hashValue) % 1000
    }

    /// Whether this place can be navigated to (has resolvable coordinates).
    var hasCoordinates: Bool {
        latitude != nil && longitude != nil
    }

    /// The budget tip to render, or nil when there is nothing usable to show — the
    /// card binds its tip line to this so an empty/whitespace tip is hidden.
    var budgetTipDisplay: String? {
        guard let tip = budgetTip?.trimmingCharacters(in: .whitespacesAndNewlines),
              !tip.isEmpty else { return nil }
        return tip
    }

    /// "0.4 mi" — the distance to render, or nil when unknown.
    var distanceDisplay: String? {
        guard let distanceMiles else { return nil }
        return String(format: "%.1f mi", distanceMiles)
    }

    /// Memberwise init with defaults for the photo / food-run fields so existing
    /// call sites (mock fixtures, tests) that predate later upgrades keep compiling.
    init(id: String, name: String, category: DealCategory, priceBucket: String?,
         rating: Double?, whyRecommended: String?, bestFor: String?, address: String?,
         latitude: Double?, longitude: Double?, vibeTags: [String],
         studentValueScore: Double?, confidenceLabel: String?,
         budgetTip: String? = nil,
         primaryPhotoUrl: String? = nil, imageStatus: String? = nil,
         distanceMiles: Double? = nil, tags: [String] = []) {
        self.id = id
        self.name = name
        self.category = category
        self.priceBucket = priceBucket
        self.rating = rating
        self.whyRecommended = whyRecommended
        self.bestFor = bestFor
        self.address = address
        self.latitude = latitude
        self.longitude = longitude
        self.vibeTags = vibeTags
        self.studentValueScore = studentValueScore
        self.confidenceLabel = confidenceLabel
        self.budgetTip = budgetTip
        self.primaryPhotoUrl = primaryPhotoUrl
        self.imageStatus = imageStatus
        self.distanceMiles = distanceMiles
        self.tags = tags
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
    let budgetTip: String?
    let primaryPhotoUrl: String?
    let imageStatus: String?

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
            confidenceLabel: confidenceLabel,
            budgetTip: budgetTip,
            primaryPhotoUrl: primaryPhotoUrl,
            imageStatus: imageStatus
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
