import SwiftUI

/// Search-owned discovery editor. Edits a local `draft` and only mutates global
/// discovery on Apply, so the feed and saved deals update together atomically.
/// Supports Nearby (current location / city / ZIP + radius) and online-only
/// Anywhere. Changing location never affects saved deals.
struct LocationSelectorView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var draft: DiscoveryPreference = .default
    @State private var query = ""
    @State private var candidates: [PlaceCandidate] = []
    @State private var isLocating = false
    @State private var isResolving = false
    @State private var errorMessage: String?

    private var radiusBinding: Binding<Int> {
        Binding(
            get: { draft.radiusMiles },
            set: { draft = .nearby(center: draft.center, radiusMiles: $0).switching(to: draft.mode) }
        )
    }

    private var modeBinding: Binding<DiscoveryMode> {
        Binding(
            get: { draft.mode },
            set: { draft = draft.switching(to: $0) }
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.sm) {
                    modePicker

                    Text("Changing your location updates the deals you see. It never removes anything you’ve saved.")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedText)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if draft.mode == .nearby {
                        nearbyControls
                    } else {
                        anywhereCard
                    }
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
                    Button("Apply") {
                        Task {
                            await app.applyDiscovery(draft)
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear { draft = app.discovery }
        }
    }

    private var modePicker: some View {
        Picker("Mode", selection: modeBinding) {
            Text("Nearby").tag(DiscoveryMode.nearby)
            Text("Anywhere").tag(DiscoveryMode.anywhere)
        }
        .pickerStyle(.segmented)
    }

    // MARK: Nearby

    @ViewBuilder private var nearbyControls: some View {
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

        selectedCenterCard

        DealyCard {
            RadiusControl(radius: radiusBinding)
        }
        .padding(.top, Spacing.xs)
    }

    private var currentLocationButton: some View {
        Button { useCurrentLocation() } label: {
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

    private var selectedCenterCard: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "mappin.circle.fill").foregroundStyle(Theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Selected location").font(.caption).foregroundStyle(Theme.mutedText)
                Text(draft.center.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
            }
            Spacer()
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .dealyCardSurface()
    }

    // MARK: Anywhere

    private var anywhereCard: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "globe").foregroundStyle(Theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Online deals anywhere")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                Text("Browse online-only deals with no location.")
                    .font(.caption)
                    .foregroundStyle(Theme.mutedText)
            }
            Spacer()
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .dealyCardSurface()
    }

    // MARK: Actions

    private func useCurrentLocation() {
        isLocating = true
        errorMessage = nil
        candidates = []
        Task { @MainActor in
            defer { isLocating = false }
            do {
                let center = try await app.resolveDeviceCenter()
                select(center)
                Haptics.selection()
            } catch let error as LocationProviderError {
                errorMessage = Self.message(for: error)
            } catch {
                errorMessage = "We couldn't get your location. Try a city or ZIP instead."
            }
        }
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
        draft = .nearby(center: center, radiusMiles: draft.radiusMiles)
        candidates = []
        errorMessage = nil
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
}
