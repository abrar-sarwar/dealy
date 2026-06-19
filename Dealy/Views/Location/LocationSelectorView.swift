import SwiftUI

/// Location & radius picker. Applies on Done so saved deals and feed update
/// together. Saved deals are never affected by changing location.
struct LocationSelectorView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var selected: Campus = .georgiaState
    @State private var radius: Int = 3

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.sm) {
                    currentLocationCard

                    Text("Your campus or city sets which mock deals appear nearby. Changing it won’t remove anything you’ve saved.")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, Spacing.xs)

                    ForEach(Campus.all) { campus in
                        CampusRow(campus: campus, isSelected: campus.id == selected.id) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                selected = campus
                                radius = campus.defaultRadius
                            }
                            Haptics.selection()
                        }
                    }

                    DealyCard {
                        RadiusControl(radius: $radius)
                    }
                    .padding(.top, Spacing.xs)
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        app.selectCampus(selected, radius: radius)
                        Haptics.impact(.light)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                selected = app.currentCampus
                radius = app.radius
            }
        }
    }

    /// Preview of the upcoming GPS auto-detect feature. Disabled until the
    /// backend + CoreLocation permission flow ships.
    private var currentLocationCard: some View {
        HStack(spacing: Spacing.sm) {
            ZStack {
                Circle().fill(Theme.brandGradient).frame(width: 42, height: 42)
                Image(systemName: "location.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Use my current location")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                Text("Auto-detect deals right around you")
                    .font(.caption)
                    .foregroundStyle(Theme.mutedText)
            }
            Spacer(minLength: Spacing.xs)
            Text("Coming soon")
                .font(.caption2.weight(.bold))
                .foregroundStyle(Theme.primary)
                .padding(.vertical, 5)
                .padding(.horizontal, Spacing.xs)
                .background(Capsule().fill(Theme.primary.opacity(0.12)))
        }
        .padding(Spacing.md)
        .dealyCardSurface()
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .strokeBorder(Theme.primary.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Use my current location. Coming soon.")
    }
}
