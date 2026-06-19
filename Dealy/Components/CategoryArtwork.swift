import SwiftUI

/// Generated decorative artwork for a deal — a category gradient with a layered
/// symbol motif and soft geometric accents. Deterministic via `visualSeed`,
/// so it doubles as the fallback when no remote image exists.
struct CategoryArtwork: View {
    let category: DealCategory
    var seed: Int = 0
    var symbolScale: CGFloat = 1.0

    private var rotation: Double { Double((seed % 4)) * 12 - 18 }
    private var accentOffset: CGFloat { CGFloat((seed % 3)) * 18 - 18 }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                category.gradient

                // Layered translucent circles for depth.
                Circle()
                    .fill(.white.opacity(0.12))
                    .frame(width: geo.size.width * 0.7)
                    .offset(x: geo.size.width * 0.32 + accentOffset, y: -geo.size.height * 0.28)
                Circle()
                    .fill(.black.opacity(0.08))
                    .frame(width: geo.size.width * 0.5)
                    .offset(x: -geo.size.width * 0.3, y: geo.size.height * 0.34)

                // Faint repeating symbol texture.
                Image(systemName: category.symbol)
                    .font(.system(size: geo.size.height * 0.42, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.16))
                    .rotationEffect(.degrees(rotation))
                    .offset(x: -geo.size.width * 0.28, y: geo.size.height * 0.22)

                // Hero symbol.
                Image(systemName: category.symbol)
                    .font(.system(size: geo.size.height * 0.34 * symbolScale, weight: .bold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
                    .symbolRenderingMode(.hierarchical)
            }
            .clipped()
        }
        .accessibilityHidden(true)
    }
}
