import SwiftUI

struct OnboardingIntroView: View {
    var onContinue: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appear = false
    @State private var drift: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            brand
            Spacer(minLength: Spacing.lg)
            glyph
            Spacer(minLength: Spacing.lg)
            hero
            Spacer(minLength: Spacing.lg)
            footer
        }
        .padding(.horizontal, Spacing.xl)
        .padding(.top, Spacing.lg)
        .padding(.bottom, Spacing.xl)
        .background(Theme.background.ignoresSafeArea())
        .onAppear(perform: animateIn)
    }

    private var brand: some View {
        Text("dealy")
            .font(.system(size: 22, weight: .black, design: .rounded))
            .tracking(-0.5)
            .foregroundStyle(Theme.primaryText)
            .accessibilityLabel("Dealy")
    }

    /// The Dealy tag glyph on its own — no tile, no stacked cards. Its built-in
    /// speed lines plus a gentle horizontal drift hint at the swipe.
    private var glyph: some View {
        Image("DealyGlyph")
            .resizable()
            .scaledToFit()
            .frame(height: 208)
            .frame(maxWidth: .infinity)
            .scaleEffect(appear ? 1 : 0.82)
            .opacity(appear ? 1 : 0)
            .offset(x: drift)
            .accessibilityHidden(true)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Save what you\ncan on deals.")
                .font(.system(size: 50, weight: .black, design: .rounded))
                .tracking(-1.6)
                .minimumScaleFactor(0.72)
                .foregroundStyle(Theme.primaryText)
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 16)

            Text("Swipe deals near you and keep the ones worth it.")
                .font(.title3.weight(.medium))
                .foregroundStyle(Theme.mutedText)
                .lineSpacing(4)
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 10)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Next, Dealy will ask for your location. You can change the distance anytime from Home filters.")
                .font(.footnote)
                .foregroundStyle(Theme.faintText)

            Button("Show me how", action: onContinue)
                .buttonStyle(.primaryDealy)
        }
        .opacity(appear ? 1 : 0)
    }

    private func animateIn() {
        guard !appear else { return }

        if reduceMotion {
            appear = true
            return
        }

        withAnimation(.spring(response: 0.7, dampingFraction: 0.8)) {
            appear = true
        }
        withAnimation(.easeInOut(duration: 2.1).repeatForever(autoreverses: true)) {
            drift = 9
        }
    }
}
