import SwiftUI

/// First-run experience: welcome → interests → hands-on practice.
/// Device location prepares itself in the background; there is no location form.
struct OnboardingFlow: View {
    var onFinished: () -> Void
    @Environment(AppState.self) private var app

    @State private var step: OnboardingStep = .welcome
    @State private var interests: Set<DealCategory> = [.food, .groceries, .entertainment]

    var body: some View {
        content
            .background(Theme.background.ignoresSafeArea())
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .welcome:
            OnboardingIntroView { advance() }
                .transition(stepTransition)
        case .interests:
            OnboardingInterestsView(interests: $interests) { advance() }
                .transition(stepTransition)
        case .practice:
            OnboardingPracticeView { finish() }
                .transition(stepTransition)
        }
    }

    private var stepTransition: AnyTransition {
        .asymmetric(
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal: .move(edge: .leading).combined(with: .opacity)
        )
    }

    private func advance() {
        guard let next = step.next else { return }
        if step == .welcome {
            Task { await app.prepareDiscoveryForOnboarding() }
        }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) {
            step = next
        }
    }

    private func finish() {
        SwipeTutorialState.markSeenAfterInteractiveOnboarding()
        app.completeOnboarding(interests: interests)
        onFinished()
    }
}
