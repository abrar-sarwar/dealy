import SwiftUI

/// Search-radius slider (1–25 mi) with a clear current-value readout.
struct RadiusControl: View {
    @Binding var radius: Int

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
                   in: Double(Campus.minRadius)...Double(Campus.maxRadius),
                   step: 1)
                .tint(Theme.primary)
            HStack {
                Text("\(Campus.minRadius) mi").font(.caption2).foregroundStyle(Theme.faintText)
                Spacer()
                Text("\(Campus.maxRadius) mi").font(.caption2).foregroundStyle(Theme.faintText)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Search radius")
        .accessibilityValue("\(radius) miles")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: radius = min(radius + 1, Campus.maxRadius)
            case .decrement: radius = max(radius - 1, Campus.minRadius)
            default: break
            }
        }
    }
}
