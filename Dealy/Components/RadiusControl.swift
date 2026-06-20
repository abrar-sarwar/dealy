import SwiftUI

/// Search-radius slider (1–100 mi) with a clear current-value readout.
struct RadiusControl: View {
    @Binding var radius: Int

    private static let minRadius = DiscoveryPreference.minRadius
    private static let maxRadius = DiscoveryPreference.maxRadius

    private var radiusBinding: Binding<Double> {
        Binding(get: { Double(radius) },
                set: { radius = Int($0.rounded()) })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack {
                Label("Search radius", systemImage: "scope")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                Spacer()
                Text("\(radius) mi")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.primary)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: radius)
            }
            Slider(value: radiusBinding,
                   in: Double(Self.minRadius)...Double(Self.maxRadius),
                   step: 1)
                .tint(Theme.primary)
            HStack {
                Text("\(Self.minRadius) mi").font(.caption2).foregroundStyle(Theme.faintText)
                Spacer()
                Text("\(Self.maxRadius) mi").font(.caption2).foregroundStyle(Theme.faintText)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Search radius")
        .accessibilityValue("\(radius) miles")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: radius = min(radius + 1, Self.maxRadius)
            case .decrement: radius = max(radius - 1, Self.minRadius)
            default: break
            }
        }
    }
}
