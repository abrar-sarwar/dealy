import SwiftUI

/// Renders a deal's artwork: a real remote image when available and loadable,
/// otherwise the deterministic `CategoryArtwork` fallback. Drop-in replacement
/// for `CategoryArtwork` at deal-specific image render points.
struct DealImage: View {
    let deal: Deal
    var symbolScale: CGFloat = 1.0

    // MARK: Source resolution

    enum Source: Equatable {
        case remote(URL)
        case fallback
    }

    /// Pure function — testable without a live view.
    /// Returns `.remote(url)` only when `deal.imageURL` is a non-empty string
    /// that parses to an absolute `https` URL; otherwise `.fallback`.
    static func resolvedSource(for deal: Deal) -> Source {
        guard
            let raw = deal.imageURL,
            !raw.isEmpty,
            let url = URL(string: raw),
            url.scheme == "https"
        else {
            return .fallback
        }
        return .remote(url)
    }

    // MARK: Body

    var body: some View {
        switch Self.resolvedSource(for: deal) {
        case .remote(let url):
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    // Fill the container and clip overflow WITHOUT letting the image's
                    // intrinsic size drive layout (a `Color.clear` accepts the proposed
                    // size; the image fills it as an overlay). A bare `scaledToFill`
                    // reports the full pixel size and blows the card past its bounds.
                    Color.clear
                        .overlay(image.resizable().scaledToFill())
                        .clipped()
                case .failure:
                    CategoryArtwork(category: deal.category, seed: deal.visualSeed,
                                    symbolScale: symbolScale)
                case .empty:
                    // Placeholder while loading — reuses the artwork so the card
                    // looks complete even during the network fetch.
                    CategoryArtwork(category: deal.category, seed: deal.visualSeed,
                                    symbolScale: symbolScale)
                        .overlay(.ultraThinMaterial.opacity(0.35))
                @unknown default:
                    CategoryArtwork(category: deal.category, seed: deal.visualSeed,
                                    symbolScale: symbolScale)
                }
            }
        case .fallback:
            CategoryArtwork(category: deal.category, seed: deal.visualSeed,
                            symbolScale: symbolScale)
        }
    }
}
