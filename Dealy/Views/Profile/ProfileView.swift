import SwiftUI

struct ProfileView: View {
    @Environment(AppState.self) private var app

    @State private var showLocation = false
    @State private var showDealyPlus = false
    @State private var showInterests = false
    @State private var showNotifications = false
    @State private var showHelp = false
    @State private var showAbout = false
    @State private var confirmResetOnboarding = false
    @State private var confirmResetHistory = false
    @State private var confirmRestoreData = false
    @AppStorage(AppearancePreference.storageKey)
    private var appearanceRawValue = AppearancePreference.defaultValue.rawValue

    private var interestList: [DealCategory] {
        DealCategory.allCases.filter { app.interests.contains($0) }
    }

    private var locationDetail: String {
        switch app.discovery.mode {
        case .anywhere: return "Online deals anywhere"
        case .nearby: return "Within \(app.discovery.radiusMiles) mi radius"
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section { profileHeader.listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
                Section { statsRow.listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
                interestsSection
                preferencesSection
                membershipSection
                supportSection
                dataSection
                Section {
                    Text("Dealy MVP · v1.0\nFrontend preview with local mock data.")
                        .font(.caption2).foregroundStyle(Theme.faintText)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Profile")
            .sheet(isPresented: $showLocation) { LocationSelectorView() }
            .sheet(isPresented: $showDealyPlus) { DealyPlusView() }
            .sheet(isPresented: $showInterests) { InterestsEditorSheet() }
            .sheet(isPresented: $showNotifications) { NotificationPreferencesSheet() }
            .sheet(isPresented: $showHelp) { HelpSheet() }
            .sheet(isPresented: $showAbout) { AboutSheet() }
            .confirmationDialog("Reset onboarding?", isPresented: $confirmResetOnboarding, titleVisibility: .visible) {
                Button("Reset onboarding", role: .destructive) { app.resetOnboarding() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You’ll see the intro and setup flow again. Your saved deals stay.")
            }
            .confirmationDialog("Reset deal history?", isPresented: $confirmResetHistory, titleVisibility: .visible) {
                Button("Reset history", role: .destructive) {
                    app.resetDealHistory(); Haptics.notify(.success)
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Clears swipe history and tracked savings. Saved deals and preferences stay.")
            }
            .confirmationDialog("Restore mock deals?", isPresented: $confirmRestoreData, titleVisibility: .visible) {
                Button("Restore deals") { Task { await app.restoreDataset(); Haptics.notify(.success) } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Reloads the full mock dataset without changing your preferences.")
            }
        }
    }

    // MARK: Header & stats

    private var profileHeader: some View {
        HStack(spacing: Spacing.md) {
            ZStack {
                Circle().fill(Theme.brandGradient).frame(width: 64, height: 64)
                Image(systemName: "person.fill").font(.title).foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Student Saver").font(.title3.weight(.bold)).foregroundStyle(Theme.primaryText)
                Label(app.discovery.center.displayName,
                      systemImage: app.discovery.mode == .anywhere ? "globe" : "mappin.circle.fill")
                    .font(.subheadline).foregroundStyle(Theme.mutedText)
                Text(locationDetail)
                    .font(.caption).foregroundStyle(Theme.faintText)
            }
            Spacer()
        }
        .padding(Spacing.md)
        .dealyCardSurface()
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.xs)
    }

    private var statsRow: some View {
        HStack(spacing: Spacing.sm) {
            stat(value: Format.moneyExact(app.realizedSavings()), label: "Saved this month", tint: Theme.save)
            stat(value: "\(app.savedCount)", label: "Saved deals", tint: Theme.primary)
            stat(value: "\(app.watchedCount)", label: "Watching", tint: Theme.watch)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.xs)
    }

    private func stat(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.system(.title3, design: .rounded, weight: .bold)).foregroundStyle(tint)
            Text(label).font(.caption2).foregroundStyle(Theme.mutedText).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.sm)
        .dealyCardSurface(cornerRadius: Radius.md)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }

    // MARK: Sections

    private var interestsSection: some View {
        Section("Your interests") {
            if interestList.isEmpty {
                Text("No interests selected yet.").foregroundStyle(Theme.mutedText)
            } else {
                FlowChips(items: interestList.map { $0.displayName })
                    .padding(.vertical, Spacing.xs)
            }
            Button { showInterests = true } label: { Label("Manage interests", systemImage: "heart.text.square") }
        }
    }

    private var preferencesSection: some View {
        Section("Preferences") {
            Picker(selection: $appearanceRawValue) {
                ForEach(AppearancePreference.allCases) { appearance in
                    Label(appearance.displayName, systemImage: appearance.symbol)
                        .tag(appearance.rawValue)
                }
            } label: {
                Label("Appearance", systemImage: "circle.lefthalf.filled")
                    .foregroundStyle(Theme.primaryText)
            }
            .pickerStyle(.menu)

            Button { showLocation = true } label: {
                settingRow("mappin.circle.fill", "Location & radius", detail: app.discovery.center.displayName)
            }
            Button { showNotifications = true } label: {
                settingRow("bell.fill", "Notifications", detail: app.notificationsEnabled ? "On" : "Off")
            }
        }
    }

    private var membershipSection: some View {
        Section("Membership") {
            Button { showDealyPlus = true } label: {
                settingRow("crown.fill", "Dealy+", detail: "Preview")
            }
        }
    }

    private var supportSection: some View {
        Section("Support") {
            Button { showHelp = true } label: { settingRow("questionmark.circle.fill", "Help", detail: nil) }
            Button { showAbout = true } label: { settingRow("info.circle.fill", "About Dealy", detail: nil) }
        }
    }

    private var dataSection: some View {
        Section("Data") {
            Button { confirmRestoreData = true } label: {
                Label("Restore mock deals", systemImage: "arrow.clockwise")
            }
            Button(role: .destructive) { confirmResetHistory = true } label: {
                Label("Reset deal history & savings", systemImage: "trash")
            }
            Button(role: .destructive) { confirmResetOnboarding = true } label: {
                Label("Reset onboarding", systemImage: "arrow.uturn.backward.circle")
            }
        }
    }

    private func settingRow(_ symbol: String, _ title: String, detail: String?) -> some View {
        HStack {
            Label(title, systemImage: symbol).foregroundStyle(Theme.primaryText)
            Spacer()
            if let detail {
                Text(detail).font(.subheadline).foregroundStyle(Theme.mutedText)
            }
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Theme.faintText)
        }
    }
}
