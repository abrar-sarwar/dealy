import SwiftUI

struct OnboardingInterestsView: View {
    @Binding var interests: Set<DealCategory>
    var onContinue: () -> Void

    private var meetsRecommended: Bool { interests.count >= 3 }

    var body: some View {
        VStack(spacing: 0) {
            OnboardingHeader(
                title: "What do you love?",
                subtitle: "Pick at least three so we can tune your feed. You can always change these later."
            )

            ScrollView {
                InterestGrid(selection: $interests)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.lg)
            }

            VStack(spacing: Spacing.sm) {
                Text(meetsRecommended
                     ? "\(interests.count) selected — nice."
                     : "\(interests.count) selected · 3 recommended")
                    .font(.footnote)
                    .foregroundStyle(meetsRecommended ? Theme.save : Theme.mutedText)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: interests.count)

                Button("Continue", action: onContinue)
                    .buttonStyle(.primaryDealy)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xl)
        }
        .background(Theme.background.ignoresSafeArea())
    }
}
