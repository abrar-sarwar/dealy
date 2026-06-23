import SwiftUI

/// Edit interests; applies on Done.
struct InterestsEditorSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var selection: Set<DealCategory> = []

    var body: some View {
        NavigationStack {
            ScrollView {
                Text("Pick the categories you care about. This tunes your feed and Explore.")
                    .font(.subheadline).foregroundStyle(Theme.mutedText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Spacing.lg).padding(.top, Spacing.sm)
                InterestGrid(selection: $selection)
                    .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Interests")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { app.setInterests(selection); dismiss() }.fontWeight(.semibold)
                }
            }
            .onAppear { selection = app.interests }
        }
    }
}

/// Notification preferences. Real delivery requires a backend; toggles persist
/// the user's intent and clearly label what's backend-dependent.
struct NotificationPreferencesSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var enabled = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Enable deal alerts", isOn: $enabled)
                        .tint(Theme.primary)
                        .onChange(of: enabled) { _, value in app.setNotificationsEnabled(value) }
                } footer: {
                    Text("Saves your preference now. Live alerts will be delivered once Dealy connects to its backend.")
                }

                Section("Alert types") {
                    placeholderRow("Watched deal expiring", symbol: "clock.badge.exclamationmark")
                    placeholderRow("New deals in your interests", symbol: "sparkles")
                    placeholderRow("Big drops near campus", symbol: "tag.fill")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .onAppear { enabled = app.notificationsEnabled }
        }
    }

    private func placeholderRow(_ title: String, symbol: String) -> some View {
        HStack {
            Label(title, systemImage: symbol).foregroundStyle(enabled ? Theme.primaryText : Theme.mutedText)
            Spacer()
            Text("Soon").font(.caption2.weight(.semibold)).foregroundStyle(Theme.faintText)
                .padding(.vertical, 3).padding(.horizontal, 7)
                .background(Capsule().fill(Theme.fieldBackground))
        }
        .disabled(true)
    }
}

struct HelpSheet: View {
    @Environment(\.dismiss) private var dismiss
    private let faqs: [(String, String)] = [
        ("How do I save a deal?", "Swipe right on a card, or tap the heart. Saved deals live in the Saved tab."),
        ("What is Deal Score?", "A transparent local estimate from discount strength, distance, urgency, and your interests."),
        ("How is “nearby” decided?", "By your device's current location, plus your 1–100 mile radius. Switch to Anywhere for online-only deals when you'd rather not share location."),
        ("What does the Verified badge mean?", "Dealy recently confirmed the deal directly with its source — the merchant or organizer, its terms, and its expiration."),
        ("How is savings tracked?", "“Mark as used” on a deal adds its savings once. Potential savings reflect your saved deals.")
    ]

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(faqs.enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.0).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.primaryText)
                        Text(item.1).font(.subheadline).foregroundStyle(Theme.mutedText)
                    }
                    .padding(.vertical, 2)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Help")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

struct AboutSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.md) {
                Spacer()
                Image("DealyMonochrome")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 112, height: 96)
                    .foregroundStyle(Theme.primaryText)
                Text("Dealy").font(.system(size: 30, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.primaryText)
                Text("Swipe. Save. Repeat.").font(.headline).foregroundStyle(Theme.primary)
                Text("A swipe-first, location-aware savings app. This MVP is a frontend preview built with SwiftUI and local mock data — launching around Atlanta and Georgia campuses.")
                    .font(.subheadline).foregroundStyle(Theme.mutedText)
                    .multilineTextAlignment(.center).padding(.horizontal, Spacing.lg)
                Spacer()
                Text("Version 1.0 (MVP)").font(.caption).foregroundStyle(Theme.faintText)
            }
            .padding(.bottom, Spacing.xl)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("About").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}
