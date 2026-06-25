import Foundation

/// A savings offer. Immutable value type — user state (saved/watched) lives
/// centrally in AppState keyed by `id`, never copied into the deal itself.
struct Deal: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let merchant: String
    let category: DealCategory
    let currentPrice: Decimal
    let originalPrice: Decimal
    let distanceMiles: Double
    let expirationDate: Date
    let dealScore: Int            // 0...100, deterministic mock relevance
    let isOnline: Bool
    let shortDescription: String
    let detailedDescription: String
    let terms: String
    let locationTags: [String]
    let couponCode: String?
    let destinationURL: String?
    let latitude: Double?
    let longitude: Double?
    /// Seed used to vary card artwork within a category.
    let visualSeed: Int
    /// When this offer was published, used for accurate recent-first sorting.
    var publishedAt: Date = .distantPast
    /// Server-controlled trust signal: Dealy recently confirmed this deal through
    /// its authoritative source. Never set or trusted from the client.
    var verified: Bool = false
    /// Student-exclusive offer (e.g. an education/student program). Drives the
    /// `.national` inventory class for online deals. Defaults false.
    var isStudentOnly: Bool = false
    /// First-class TrendingCampusDeals slot: a high-value promotion surfaced
    /// across all supported campuses regardless of which campus it is near.
    /// Server-controlled; defaults false. The selection logic that sets this is
    /// a follow-on sub-project — this is the slot, not fabricated data.
    var isTrending: Bool = false
    /// Remote image URL string (OG image scraped from the deal page). Nil when
    /// the backend couldn't resolve one. The app renders this via AsyncImage with
    /// CategoryArtwork as the fallback.
    var imageURL: String? = nil
    /// Brand to search for physical redemption of an online program (e.g.
    /// "Apple Store"); nil = online-only. Drives the "Find Nearby Stores" finder.
    var redemptionBrand: String? = nil
    /// Server-reported coordinate precision. "exact" = real storefront coordinates;
    /// anything else (default "approximate") means we only know the region centroid.
    var locationPrecision: String = "approximate"
    /// Campus this deal is tied to (gsu/gt/ksu/uga); nil for non-campus deals.
    var campusSlug: String? = nil
    /// Whether redeeming requires a valid student ID. Server-controlled.
    var requiresStudentId: Bool = false
    /// Audience segment for this deal. One of "students", "campus_community",
    /// "faculty_staff", "alumni", "general". Defaults to "general".
    var audience: String = "general"
    /// Finer-grained campus deal type (e.g. "student_discount", "campus_perk").
    var campusDealType: String? = nil
    /// Backend deal-quality score (0–100): concrete offers high, vague/junk low.
    /// Server-controlled; drives the "Best" ranking. Defaults 0 when unscored.
    var qualityScore: Double = 0

    /// Campus badge label (e.g. "GSU") when this deal is tied to a campus, else nil.
    var campusBadge: String? { campusSlug.map { $0.uppercased() } }

    // MARK: Eligibility badge

    /// The eligibility chip to display for this deal, if any.
    /// Student-ID wins over all other audience signals — the backend guarantees
    /// `requiresStudentId == false` for non-student audiences, so there is no
    /// false-positive risk.
    enum EligibilityBadge: Equatable {
        case studentID
        case campusPerk
        case facultyStaff
        case alumni
    }

    var eligibilityBadge: EligibilityBadge? {
        if requiresStudentId { return .studentID }
        if audience == "campus_community" || campusDealType == "campus_perk" { return .campusPerk }
        if audience == "faculty_staff" { return .facultyStaff }
        if audience == "alumni" { return .alumni }
        return nil
    }

    // MARK: Computed money

    /// Absolute money saved versus original price.
    var savingsAmount: Decimal {
        max(originalPrice - currentPrice, 0)
    }

    /// Percentage off, 0...100. Returns 0 when there is no original price.
    var savingsPercentage: Int {
        guard originalPrice > 0 else { return 0 }
        let fraction = (savingsAmount / originalPrice) as Decimal
        let pct = NSDecimalNumber(decimal: fraction * 100).doubleValue
        return Int(pct.rounded())
    }

    // MARK: Time

    var isExpired: Bool {
        expirationDate <= Date()
    }

    /// Whether a deal can currently be redeemed. Expired deals are never
    /// redeemable — this is the single testable gate for the missed-deals surface.
    var isRedeemable: Bool { !isExpired }

    /// True when the deal ends within the next 12 hours.
    func isEndingSoon(reference: Date = Date()) -> Bool {
        let interval = expirationDate.timeIntervalSince(reference)
        return interval > 0 && interval <= 60 * 60 * 12
    }
}

extension Deal {
    /// True when the deal's coordinates are only region-level (centroid), not a
    /// real storefront. Approximate deals must never show precise distances.
    var isApproximateLocation: Bool { locationPrecision != "exact" }

    /// True only when the backend reports exact storefront coordinates AND both
    /// lat/lng are present. The single gate for offering precise navigation —
    /// we never fake turn-by-turn directions to an approximate centroid.
    var isExactLocation: Bool {
        locationPrecision == "exact" && latitude != nil && longitude != nil
    }

    /// Display tag for the closest matching location, for card chips.
    var primaryLocationTag: String {
        isOnline ? "Online" : (locationTags.first ?? "Nearby")
    }

    /// True when there's a concrete current/original price to compare.
    /// Some deals (e.g. "extra 20% off", "free with ID") have no fixed price.
    var hasFixedPricing: Bool {
        originalPrice > 0 && currentPrice > 0
    }
}
