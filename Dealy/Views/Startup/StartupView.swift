import SwiftUI

/// Brief branded startup transition shown after the static launch screen.
/// Not a navigable page — it calls `onFinished` once and goes away.
struct StartupView: View {
    var onFinished: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animateIn = false
    @State private var pulse = false

    var body: some View {
        ZStack {
            Theme.brandGradient
                .ignoresSafeArea()

            // Soft radial glow for depth.
            RadialGradient(colors: [.white.opacity(0.22), .clear],
                           center: .center, startRadius: 8, endRadius: 320)
                .ignoresSafeArea()
                .blendMode(.softLight)

            VStack(spacing: Spacing.lg) {
                Image("DealyMark")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 132, height: 132)
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(.white.opacity(0.25), lineWidth: 1)
                    )
                    .dealyShadow(.floating)
                    .scaleEffect(animateIn ? 1 : 0.82)
                    .scaleEffect(pulse ? 1.03 : 1.0)
                    .blur(radius: animateIn ? 0 : 8)
                    .opacity(animateIn ? 1 : 0)
                    .accessibilityLabel("Dealy")

                VStack(spacing: Spacing.xs) {
                    Text("Dealy")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                    Text("Swipe. Save. Repeat.")
                        .font(.headline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .opacity(animateIn ? 1 : 0)
                .offset(y: animateIn ? 0 : 12)
            }
        }
        .onAppear(perform: start)
    }

    private func start() {
        if reduceMotion {
            animateIn = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { onFinished() }
            return
        }
        withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
            animateIn = true
        }
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true).delay(0.6)) {
            pulse = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.9) { onFinished() }
    }
}

#Preview {
    StartupView {}
}
