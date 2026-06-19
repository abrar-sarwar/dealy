import SwiftUI

enum AppPhase {
    case startup
    case onboarding
    case main
}

/// Top-level coordinator: shows the startup transition, then routes to
/// onboarding (first launch) or the main app. Reacts to onboarding being
/// reset from Profile by returning to the onboarding flow.
struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: AppPhase = .startup

    var body: some View {
        ZStack {
            switch phase {
            case .startup:
                StartupView { advanceFromStartup() }
                    .transition(.opacity)
            case .onboarding:
                OnboardingFlow { transition(to: .main) }
                    .transition(.opacity)
            case .main:
                MainTabView()
                    .transition(.opacity.combined(with: .scale(scale: 1.02)))
            }
        }
        .task { await app.loadDeals() }
        .onChange(of: app.hasCompletedOnboarding) { _, completed in
            // Allow Profile's "Reset onboarding" to route back, and completion forward.
            if !completed && phase == .main {
                transition(to: .onboarding)
            }
        }
    }

    private func advanceFromStartup() {
        transition(to: app.hasCompletedOnboarding ? .main : .onboarding)
    }

    private func transition(to newPhase: AppPhase) {
        if reduceMotion {
            phase = newPhase
        } else {
            withAnimation(.easeInOut(duration: 0.45)) { phase = newPhase }
        }
    }
}
