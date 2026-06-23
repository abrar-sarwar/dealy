import SwiftUI

/// Search-owned discovery editor. Edits a local `draft` and only mutates global
/// discovery on Apply, so the feed and saved deals update together atomically.
/// Nearby uses the device's current location (no city/ZIP entry); Anywhere is
/// online-only. Changing location never affects saved deals.
struct LocationSelectorView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var draft: DiscoveryPreference = .default
    @State private var isLocating = false
    @State private var errorMessage: String?
    /// True once the device returned a real fix during this editing session.
    @State private var locatedThisSession = false

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

    /// Whether the staged Nearby center is a real device fix (vs a legacy anchor).
    private var hasDeviceCenter: Bool {
        draft.center.source == .device
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
                    .disabled(draft.mode == .nearby && !hasDeviceCenter)
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

            if app.locationAuthorization == .denied {
                Button("Open Settings") { openSettings() }
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }

        if hasDeviceCenter {
            selectedCenterCard
            DealyCard {
                RadiusControl(radius: radiusBinding)
            }
            .padding(.top, Spacing.xs)
        }
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

    private var selectedCenterCard: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "location.fill").foregroundStyle(Theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Nearby").font(.caption).foregroundStyle(Theme.mutedText)
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
        Task { @MainActor in
            defer { isLocating = false }
            do {
                let center = try await app.resolveDeviceCenter()
                draft = .nearby(center: center, radiusMiles: draft.radiusMiles)
                locatedThisSession = true
                Haptics.selection()
            } catch let error as LocationProviderError {
                errorMessage = Self.message(for: error)
            } catch {
                errorMessage = "We couldn't get your location right now. Try again, or use Anywhere."
            }
        }
    }

    private func openSettings() {
        #if canImport(UIKit)
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
        #endif
    }

    private static func message(for error: LocationProviderError) -> String {
        switch error {
        case .denied:
            return "Location access is off. Enable it in Settings to use Nearby, or switch to Anywhere."
        case .restricted:
            return "Location is restricted on this device. Switch to Anywhere for online deals."
        case .unavailable, .timeout:
            return "We couldn't get your location right now. Try again, or switch to Anywhere."
        }
    }
}
