import SwiftUI

/// Location step: Dealy's Nearby feed uses the device's current location. We ask
/// for When-In-Use permission here. If it's unavailable, the app is never blocked
/// — the user drops into Anywhere (online-only) deals and can enable Nearby later.
/// There is no city/ZIP entry: Nearby is device-location-only.
struct OnboardingLocationView: View {
    @Binding var discovery: DiscoveryPreference
    var onContinue: () -> Void

    @Environment(AppState.self) private var app

    @State private var isLocating = false
    @State private var errorMessage: String?
    /// A choice has been made (Nearby located, or Anywhere selected).
    @State private var resolved = false

    private var isNearby: Bool { discovery.mode == .nearby && resolved }

    private var radiusBinding: Binding<Int> {
        Binding(
            get: { discovery.radiusMiles },
            set: { discovery = .nearby(center: discovery.center, radiusMiles: $0) }
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            OnboardingHeader(
                title: "Where are you?",
                subtitle: "Dealy shows deals near your current location. Turn on location for Nearby deals, or browse online-only deals in Anywhere."
            )

            ScrollView {
                VStack(spacing: Spacing.sm) {
                    currentLocationButton

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(Theme.mutedText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    anywhereButton

                    if isNearby {
                        selectedCenterCard
                        DealyCard {
                            RadiusControl(radius: radiusBinding)
                        }
                        .padding(.top, Spacing.xs)
                    } else if resolved {
                        anywhereCard
                    }
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.lg)
            }

            Button("Continue") {
                Task { @MainActor in
                    await app.applyDiscovery(discovery)
                    onContinue()
                }
            }
            .buttonStyle(.primaryDealy)
            .disabled(!resolved)
            .opacity(resolved ? 1 : 0.5)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xl)
        }
        .background(Theme.background.ignoresSafeArea())
    }

    // MARK: Current location

    private var currentLocationButton: some View {
        Button {
            useCurrentLocation()
        } label: {
            HStack(spacing: Spacing.sm) {
                ZStack {
                    Circle().fill(Theme.brandGradient).frame(width: 42, height: 42)
                    if isLocating {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "location.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.white)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Use my current location")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                    Text("Find verified deals right around you")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedText)
                }
                Spacer(minLength: Spacing.xs)
            }
            .padding(Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .dealyCardSurface()
        }
        .buttonStyle(.plain)
        .disabled(isLocating)
        .accessibilityLabel("Use my current location")
    }

    private func useCurrentLocation() {
        isLocating = true
        errorMessage = nil
        Task { @MainActor in
            defer { isLocating = false }
            do {
                try await app.refreshFromDeviceLocation()
                discovery = app.discovery
                resolved = true
                Haptics.selection()
            } catch let error as LocationProviderError {
                // Honest fallback: stage Anywhere so the user is never blocked.
                discovery = discovery.switching(to: .anywhere)
                resolved = true
                errorMessage = Self.message(for: error)
            } catch {
                discovery = discovery.switching(to: .anywhere)
                resolved = true
                errorMessage = "We couldn't get your location. You can browse Anywhere for now."
            }
        }
    }

    private static func message(for error: LocationProviderError) -> String {
        switch error {
        case .denied:
            return "Location access is off, so we've set you to Anywhere (online deals). Enable location in Settings to see Nearby deals."
        case .restricted:
            return "Location is restricted on this device. You can browse Anywhere (online deals)."
        case .unavailable, .timeout:
            return "We couldn't get your location right now. You can browse Anywhere, or try again."
        }
    }

    // MARK: Anywhere

    private var anywhereButton: some View {
        Button {
            discovery = discovery.switching(to: .anywhere)
            resolved = true
            errorMessage = nil
            Haptics.selection()
        } label: {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "globe").foregroundStyle(Theme.primary)
                Text("Browse online deals (Anywhere)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                Spacer()
            }
            .padding(Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .dealyCardSurface()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Browse online deals anywhere")
    }

    private var selectedCenterCard: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "location.fill").foregroundStyle(Theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Nearby")
                    .font(.caption).foregroundStyle(Theme.mutedText)
                Text("Using your current location")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
            }
            Spacer()
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .dealyCardSurface()
    }

    private var anywhereCard: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "globe").foregroundStyle(Theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Anywhere")
                    .font(.caption).foregroundStyle(Theme.mutedText)
                Text("Online deals, no location needed")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
            }
            Spacer()
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .dealyCardSurface()
    }
}

/// Shared title/subtitle header for onboarding setup steps.
struct OnboardingHeader: View {
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title)
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.primaryText)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.xl)
        .padding(.bottom, Spacing.md)
    }
}
