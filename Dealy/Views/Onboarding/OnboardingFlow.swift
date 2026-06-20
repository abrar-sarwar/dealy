import SwiftUI

/// First-run experience: 3 intro pages → location setup → interests → confirm.
struct OnboardingFlow: View {
    var onFinished: () -> Void
    @Environment(AppState.self) private var app

    private enum Step: Int, CaseIterable {
        case intro1, intro2, intro3, location, interests, confirm
    }

    @State private var step: Step = .intro1
    @State private var discovery = DiscoveryPreference.default
    @State private var interests: Set<DealCategory> = [.food, .tech, .studentSupplies]

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .background(Theme.background.ignoresSafeArea())
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .intro1, .intro2, .intro3:
            OnboardingIntroView(
                page: introPage(for: step),
                pageIndex: step.rawValue,
                pageCount: 3,
                onSkip: { goTo(.location) },
                onContinue: { advanceIntro() }
            )
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                    removal: .move(edge: .leading).combined(with: .opacity)))
        case .location:
            OnboardingLocationView(discovery: $discovery) {
                goTo(.interests)
            }
        case .interests:
            OnboardingInterestsView(interests: $interests) {
                goTo(.confirm)
            }
        case .confirm:
            OnboardingConfirmView(discovery: discovery, interests: interests) {
                finish()
            }
        }
    }

    private func introPage(for step: Step) -> OnboardingPage {
        switch step {
        case .intro1: return .page1
        case .intro2: return .page2
        default:      return .page3
        }
    }

    private func advanceIntro() {
        switch step {
        case .intro1: goTo(.intro2)
        case .intro2: goTo(.intro3)
        default:      goTo(.location)
        }
    }

    private func goTo(_ newStep: Step) {
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { step = newStep }
    }

    private func finish() {
        // Discovery was already selected and applied during the location step.
        app.completeOnboarding(interests: interests)
        onFinished()
    }
}
