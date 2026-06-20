import SwiftUI

/// Candidate picker shown when a city/ZIP query resolves to one or more places.
/// Lets the user disambiguate (e.g. "Athens, GA" vs "Athens, OH").
struct LocationSearchResultsView: View {
    let candidates: [PlaceCandidate]
    var onSelect: (PlaceCandidate) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Did you mean…")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.mutedText)

            ForEach(candidates) { candidate in
                Button {
                    onSelect(candidate)
                    Haptics.selection()
                } label: {
                    HStack(spacing: Spacing.sm) {
                        Image(systemName: "mappin.circle.fill")
                            .foregroundStyle(Theme.primary)
                        Text(candidate.displayName)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Theme.primaryText)
                        Spacer(minLength: Spacing.xs)
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(Theme.faintText)
                    }
                    .padding(Spacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dealyCardSurface()
                }
                .buttonStyle(.plain)
                .accessibilityHint("Use \(candidate.displayName) as your location")
            }
        }
    }
}
