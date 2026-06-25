import SwiftUI

/// Compact place card for the Explore "local savings feed" carousels. Places have
/// no remote image, so the visual is generated `CategoryArtwork`. Tapping opens
/// directions when the place has coordinates. Sizing/clipping mirror `DealTile`.
struct PlaceTile: View {
    let place: Place
    var onTap: () -> Void

    /// "{priceBucket} · ★{rating} · {category}" — omits absent parts cleanly.
    private var metaLine: String {
        var parts: [String] = []
        if let bucket = place.priceBucket, !bucket.isEmpty { parts.append(bucket) }
        if let rating = place.rating { parts.append(String(format: "★%.1f", rating)) }
        parts.append(place.category.displayName)
        return parts.joined(separator: " · ")
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                // Real place/food photo when present, else generated artwork. Same
                // clip/fill pattern as DealImage so the photo never stretches/overflows.
                PlaceImage(photoURL: place.primaryPhotoUrl,
                           category: place.category, seed: place.visualSeed)
                    .frame(height: 132)
                    .clipped()

                VStack(alignment: .leading, spacing: 4) {
                    Text(place.name)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(2, reservesSpace: true)
                        .multilineTextAlignment(.leading)
                    Text(metaLine)
                        .font(.caption)
                        .foregroundStyle(Theme.mutedText)
                        .lineLimit(1)
                    if let why = place.whyRecommended, !why.isEmpty {
                        Text(why)
                            .font(.caption2)
                            .foregroundStyle(Theme.mutedText)
                            .lineLimit(2, reservesSpace: true)
                            .multilineTextAlignment(.leading)
                    }
                }
                .padding(Spacing.sm)
            }
            .frame(width: 210)
            .background(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).fill(Theme.surface)
            )
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .stroke(Theme.separator, lineWidth: 0.75)
            )
            .dealyShadow(.soft)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(place.name). \(metaLine)")
        .accessibilityHint(place.hasCoordinates ? "Opens directions" : "")
    }
}
