import SwiftUI

/// Branded opening. The mark floats directly on the brand gradient (no card),
/// the wordmark loads in with it, and the tagline types itself out.
/// Not a navigable page — it calls `onFinished` once and goes away.
struct StartupView: View {
    var onFinished: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let tagline = Array("Swipe. Save. Repeat.")

    @State private var appear = false      // glyph + wordmark, together
    @State private var glow = false        // breathing halo
    @State private var typed = 0           // characters revealed
    @State private var showCursor = false
    @State private var cursorOn = true

    private var typedString: String { String(tagline.prefix(typed)) }

    var body: some View {
        ZStack {
            Theme.brandGradient
                .ignoresSafeArea()

            // Soft radial depth, same family of colors so nothing reads as a seam.
            RadialGradient(colors: [.white.opacity(0.20), .clear],
                           center: .center, startRadius: 6, endRadius: 360)
                .ignoresSafeArea()
                .blendMode(.softLight)

            VStack(spacing: Spacing.lg) {
                // Mark — floats on the gradient, glow melts its edges into the bg.
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.16))
                        .frame(width: 188, height: 188)
                        .blur(radius: 34)
                        .scaleEffect(glow ? 1.08 : 0.92)

                    Image("DealyMonochrome")
                        .renderingMode(.template)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 146)
                        .foregroundStyle(.white)
                        .dealyShadow(.floating)
                }
                .scaleEffect(appear ? 1 : 0.86)
                .opacity(appear ? 1 : 0)
                .blur(radius: appear ? 0 : 6)

                // Wordmark — loads in together with the mark.
                Text("Dealy")
                    .font(.system(size: 44, weight: .semibold, design: .serif))
                    .foregroundStyle(.white)
                    .opacity(appear ? 1 : 0)
                    .offset(y: appear ? 0 : 14)

                // Tagline — typed out like it's being written.
                HStack(spacing: 2) {
                    Text(typedString)
                        .font(.system(.headline, design: .rounded).weight(.medium))
                        .foregroundStyle(.white.opacity(0.9))
                    Rectangle()
                        .fill(.white.opacity(0.9))
                        .frame(width: 2, height: 19)
                        .opacity(showCursor && cursorOn ? 1 : 0)
                }
                .frame(height: 22)
                .opacity(appear ? 1 : 0)
                .accessibilityLabel("Swipe. Save. Repeat.")
            }
            .padding(.bottom, 24)
        }
        .onAppear(perform: start)
    }

    private func start() {
        if reduceMotion {
            appear = true
            typed = tagline.count
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { onFinished() }
            return
        }

        withAnimation(.spring(response: 0.6, dampingFraction: 0.78)) {
            appear = true
        }
        withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true).delay(0.6)) {
            glow = true
        }
        withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) {
            cursorOn = false
        }

        Task { await runTypewriter() }
    }

    @MainActor
    private func runTypewriter() async {
        try? await Task.sleep(for: .milliseconds(620))   // let the mark settle first
        showCursor = true
        for i in 0...tagline.count {
            typed = i
            // brief pause after each sentence's period for a written cadence
            let last = i > 0 ? tagline[i - 1] : " "
            try? await Task.sleep(for: .milliseconds(last == "." ? 150 : 55))
        }
        try? await Task.sleep(for: .milliseconds(520))   // hold the finished line
        showCursor = false
        try? await Task.sleep(for: .milliseconds(320))
        onFinished()
    }
}

#Preview {
    StartupView {}
}
