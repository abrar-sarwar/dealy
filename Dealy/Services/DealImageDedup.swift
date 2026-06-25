import Foundation

/// De-duplicates generic/shared remote deal images. The backend sometimes
/// resolves the same generic page hero (e.g. a campus engagement photo) for
/// several unrelated deals. A single image shared by two or more deals is not a
/// real per-deal photo — it's a generic placeholder — so we null it out and let
/// each deal fall back to its category-specific `CategoryArtwork`.
enum DealImageDedup {

    /// Returns the deals with any `imageURL` shared by **two or more** deals set
    /// to `nil`. Unique images are kept untouched; deals with no image are left
    /// alone. Input order is preserved.
    static func nullingSharedImages(_ deals: [Deal]) -> [Deal] {
        // Count how many deals reference each non-nil image URL.
        var counts: [String: Int] = [:]
        for deal in deals {
            guard let url = deal.imageURL, !url.isEmpty else { continue }
            counts[url, default: 0] += 1
        }

        let shared = Set(counts.filter { $0.value >= 2 }.keys)
        guard !shared.isEmpty else { return deals }

        return deals.map { deal in
            guard let url = deal.imageURL, shared.contains(url) else { return deal }
            var copy = deal
            copy.imageURL = nil
            return copy
        }
    }
}
