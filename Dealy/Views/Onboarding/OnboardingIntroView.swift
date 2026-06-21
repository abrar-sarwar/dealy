import SwiftUI

struct OnboardingIntroView: View {
    var onContinue: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appear = false

    var body: some View {
        ZStack {
            ambientBackground

            VStack(alignment: .leading, spacing: 0) {
                brand
                Spacer()
                hero
                Spacer()
                footer
            }
            .padding(.horizontal, Spacing.xl)
            .padding(.top, Spacing.lg)
            .padding(.bottom, Spacing.xl)
        }
        .background(Theme.background.ignoresSafeArea())
        .onAppear {
            guard !appear else { return }
            if reduceMotion {
                appear = true
            } else {
                withAnimation(.spring(response: 0.7, dampingFraction: 0.82)) {
                    appear = true
                }
            }
        }
    }

    private var ambientBackground: some View {
        ZStack {
            Circle()
                .fill(Theme.primary.opacity(0.18))
                .frame(width: 330, height: 330)
                .blur(radius: 70)
                .offset(x: 150, y: -260)

            Circle()
                .fill(Theme.bright.opacity(0.10))
                .frame(width: 280, height: 280)
                .blur(radius: 80)
                .offset(x: -170, y: 320)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private var brand: some View {
        HStack(spacing: Spacing.xs) {
            Image("DealyMonochrome")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 38, height: 32)
            Text("DEALY")
                .font(.dealyCondensedBlack(size: 22))
                .tracking(0.8)
        }
        .foregroundStyle(Theme.primaryText)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Dealy")
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            Text("GOOD DEALS.\nNO DIGGING.")
                .font(.dealyCondensedBlack(size: 58))
                .tracking(-1.8)
                .minimumScaleFactor(0.72)
                .foregroundStyle(Theme.primaryText)
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 22)

            Text("Swipe through verified offers near you. Keep what fits, pass what doesn’t, and use the good ones right away.")
                .font(.title3.weight(.medium))
                .foregroundStyle(Theme.mutedText)
                .lineSpacing(4)
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 14)

            HStack(spacing: Spacing.lg) {
                feature("hand.draw", "Swipe")
                feature("bookmark", "Save")
                feature("arrow.up", "Use now")
            }
            .opacity(appear ? 1 : 0)
        }
    }

    private func feature(_ symbol: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: symbol)
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(Theme.primary)
            Text(text)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.primaryText)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Next, Dealy will ask for your location to find nearby deals. You can change it anytime from Home filters.")
                .font(.footnote)
                .foregroundStyle(Theme.faintText)

            Button("Show me how", action: onContinue)
                .buttonStyle(.primaryDealy)
        }
        .opacity(appear ? 1 : 0)
    }
}
