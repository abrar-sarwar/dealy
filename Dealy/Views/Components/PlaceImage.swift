import SwiftUI

/// Renders a place's visual: a real remote photo when available and loadable,
/// otherwise the deterministic `CategoryArtwork` fallback. Mirrors `DealImage`'s
/// clip/fill pattern (`Color.clear.overlay(img.scaledToFill()).clipped()`) so a
/// large source photo fills the container without driving layout or overflowing.
///
/// Used by `PlaceTile` (Explore cards) and the map place-preview card. The remote
/// URLs are real place/food photos (keyless Google), never logos — so the only
/// special-casing needed is the artwork fallback on nil/empty/failure.
struct PlaceImage: View {
    let photoURL: String?
    let category: DealCategory
    var seed: Int = 0
    var symbolScale: CGFloat = 1.0

    // MARK: Source resolution

    enum Source: Equatable {
        case remote(URL)
        case fallback
    }

    /// Pure, testable resolver. Returns `.remote(url)` only when `photoURL` is a
    /// non-empty string parsing to an absolute `https` URL; otherwise `.fallback`.
    static func resolvedSource(photoURL: String?) -> Source {
        guard
            let raw = photoURL,
            !raw.isEmpty,
            let url = URL(string: raw),
            url.scheme == "https"
        else {
            return .fallback
        }
        return .remote(url)
    }

    private var artwork: some View {
        CategoryArtwork(category: category, seed: seed, symbolScale: symbolScale)
    }

    var body: some View {
        switch Self.resolvedSource(photoURL: photoURL) {
        case .remote(let url):
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    Color.clear
                        .overlay(image.resizable().scaledToFill())
                        .clipped()
                case .failure:
                    artwork
                case .empty:
                    artwork.overlay(.ultraThinMaterial.opacity(0.35))
                @unknown default:
                    artwork
                }
            }
        case .fallback:
            artwork
        }
    }
}
