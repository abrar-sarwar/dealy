import SwiftUI

struct OnboardingIntroView: View {
    var onContinue: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appear = false
    @State private var logoDrift: CGFloat = -8

    var body: some View {
        ZStack {
            ambientBackground

            VStack(alignment: .leading, spacing: 0) {
                brand
                Spacer(minLength: Spacing.md)
                dealyMark
                Spacer(minLength: Spacing.lg)
                hero
                Spacer(minLength: Spacing.lg)
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
                logoDrift = 0
                return
            }

            withAnimation(.spring(response: 0.72, dampingFraction: 0.78)) {
                appear = true
            }
            withAnimation(.easeInOut(duration: 1.7).repeatForever(autoreverses: true)) {
                logoDrift = 8
            }
        }
    }

    private var ambientBackground: some View {
        ZStack {
            Circle()
                .fill(Theme.primary.opacity(0.14))
                .frame(width: 360, height: 360)
                .blur(radius: 86)
                .offset(x: 170, y: -240)

            Circle()
                .fill(Theme.save.opacity(0.07))
                .frame(width: 260, height: 260)
                .blur(radius: 90)
                .offset(x: -180, y: 340)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private var brand: some View {
        Text("dealy")
            .font(.system(size: 22, weight: .black, design: .rounded))
            .tracking(-0.5)
            .foregroundStyle(Theme.primaryText)
            .accessibilityLabel("Dealy")
    }

    private var dealyMark: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(Theme.separator.opacity(0.65), lineWidth: 1.5)
                .frame(width: 202, height: 176)
                .rotationEffect(.degrees(-8))
                .offset(x: -24, y: 8)

            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(Theme.surface.opacity(0.72))
                .overlay {
                    RoundedRectangle(cornerRadius: 34, style: .continuous)
                        .stroke(Theme.primary.opacity(0.18), lineWidth: 1)
                }
                .frame(width: 202, height: 176)
                .rotationEffect(.degrees(7))
                .offset(x: 25, y: 7)

            RoundedRectangle(cornerRadius: 38, style: .continuous)
                .fill(Theme.brandGradient)
                .frame(width: 218, height: 188)
                .overlay {
                    Image("DealyMonochrome")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(.white)
                        .frame(width: 126, height: 108)
                }
                .dealyShadow(.floating)
                .offset(x: logoDrift)
        }
        .frame(maxWidth: .infinity)
        .scaleEffect(appear ? 1 : 0.72)
        .rotationEffect(.degrees(appear ? 0 : -7))
        .opacity(appear ? 1 : 0)
        .accessibilityHidden(true)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Deals worth\nswiping for.")
                .font(.system(size: 52, weight: .black, design: .rounded))
                .tracking(-1.8)
                .minimumScaleFactor(0.72)
                .foregroundStyle(Theme.primaryText)
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 18)

            Text("See what’s nearby, keep what fits, and use the good ones right away.")
                .font(.title3.weight(.medium))
                .foregroundStyle(Theme.mutedText)
                .lineSpacing(4)
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 12)
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
}
