import SwiftUI

/// Location step: explain why we ask, offer current-location (When-In-Use) and a
/// city/ZIP fallback, and let the user set a 1–100 mile radius. Permission is
/// never mandatory — a manual place works just as well. Continue is disabled
/// until a valid nearby center has been selected.
struct OnboardingLocationView: View {
    @Binding var discovery: DiscoveryPreference
    var onContinue: () -> Void

    @Environment(AppState.self) private var app

    @State private var query = ""
    @State private var candidates: [PlaceCandidate] = []
    @State private var isLocating = false
    @State private var isResolving = false
    @State private var errorMessage: String?
    @State private var hasSelectedCenter = false

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
                subtitle: "We use your location to show deals near you. Use your current location or enter a city or ZIP — your choice."
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

                    manualSearchField

                    if !candidates.isEmpty {
                        LocationSearchResultsView(candidates: candidates) { candidate in
                            select(candidate.center)
                        }
                    }

                    if hasSelectedCenter {
                        selectedCenterCard
                        DealyCard {
                            RadiusControl(radius: radiusBinding)
                        }
                        .padding(.top, Spacing.xs)
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
            .disabled(!hasSelectedCenter)
            .opacity(hasSelectedCenter ? 1 : 0.5)
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
                    Text("Find deals right around you")
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
        candidates = []
        Task { @MainActor in
            defer { isLocating = false }
            do {
                try await app.refreshFromDeviceLocation()
                discovery = app.discovery
                hasSelectedCenter = true
                Haptics.selection()
            } catch let error as LocationProviderError {
                errorMessage = Self.message(for: error)
            } catch {
                errorMessage = "We couldn't get your location. Try a city or ZIP instead."
            }
        }
    }

    private static func message(for error: LocationProviderError) -> String {
        switch error {
        case .denied:
            return "Location access is off. Enter a city or ZIP below — no permission needed."
        case .restricted:
            return "Location is restricted on this device. Enter a city or ZIP below."
        case .unavailable, .timeout:
            return "We couldn't get your location right now. Try a city or ZIP instead."
        }
    }

    // MARK: Manual search

    private var manualSearchField: some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: "magnifyingglass").foregroundStyle(Theme.mutedText)
            TextField("City or ZIP code", text: $query)
                .textInputAutocapitalization(.words)
                .submitLabel(.search)
                .onSubmit(runSearch)
            if isResolving {
                ProgressView()
            } else if !query.isEmpty {
                Button("Search", action: runSearch)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primary)
            }
        }
        .padding(Spacing.md)
        .dealyCardSurface()
    }

    private func runSearch() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isResolving = true
        errorMessage = nil
        candidates = []
        Task { @MainActor in
            defer { isResolving = false }
            do {
                let results = try await app.resolvePlaces(trimmed)
                if results.isEmpty {
                    errorMessage = "No places found for “\(trimmed)”."
                } else if results.count == 1 {
                    select(results[0].center)
                } else {
                    candidates = results
                }
            } catch {
                errorMessage = "Location search is unavailable right now."
            }
        }
    }

    private func select(_ center: DiscoveryCenter) {
        discovery = .nearby(center: center, radiusMiles: discovery.radiusMiles)
        candidates = []
        errorMessage = nil
        hasSelectedCenter = true
    }

    private var selectedCenterCard: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "mappin.circle.fill").foregroundStyle(Theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Selected location")
                    .font(.caption).foregroundStyle(Theme.mutedText)
                Text(discovery.center.displayName)
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
