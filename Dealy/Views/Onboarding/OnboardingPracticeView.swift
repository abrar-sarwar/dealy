import SwiftUI

struct OnboardingPracticeView: View {
    var onFinish: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var demo = PracticeDemoState()
    @State private var dragOffset: CGSize = .zero
    @State private var isAnimatingManualSwipe = false
    @State private var showDetails = false
    @State private var showUseNow = false
    @State private var demoTask: Task<Void, Never>?
    @State private var demoNudge: CGSize = .zero

    private static let practiceDeal = Deal(
        id: "practice-deal",
        title: "Two slices + a drink",
        merchant: "Practice Pizza",
        category: .food,
        currentPrice: 6,
        originalPrice: 12,
        distanceMiles: 0.8,
        expirationDate: Calendar.current.date(byAdding: .day, value: 2, to: .now) ?? .now,
        dealScore: 92,
        isOnline: false,
        shortDescription: "A practice deal for learning Dealy.",
        detailedDescription: "This is where you’ll see what the offer includes, why it’s useful, where to redeem it, and any important restrictions.",
        terms: "Practice only. Real deals show merchant terms and redemption instructions here.",
        locationTags: ["Downtown"],
        couponCode: "PRACTICE",
        destinationURL: nil,
        latitude: nil,
        longitude: nil,
        visualSeed: 17,
        publishedAt: .now,
        verified: true
    )

    private var cardOffset: CGSize {
        demo.isInterrupted ? dragOffset : demoNudge
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            practiceStage

            VStack(spacing: Spacing.sm) {
                Text("Watch the preview or try it yourself.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.mutedText)

                Button("Start exploring", action: onFinish)
                    .buttonStyle(.primaryDealy)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xl)
        }
        .background(Theme.background.ignoresSafeArea())
        .sheet(isPresented: $showDetails) {
            PracticeDealDetailView(deal: Self.practiceDeal)
        }
        .sheet(isPresented: $showUseNow) {
            PracticeUseNowView()
        }
        .onAppear {
            scheduleDemo()
        }
        .onDisappear {
            demoTask?.cancel()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("See how it works")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.primaryText)
            Text("It’ll show you automatically. Touch the card anytime to take over.")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.xl)
        .padding(.bottom, Spacing.sm)
    }

    private var practiceStage: some View {
        GeometryReader { proxy in
            let cardHeight = min(proxy.size.height - 76, 500)

            ZStack {
                SwipeCardView(
                    deal: Self.practiceDeal,
                    campus: .atlanta,
                    dragTranslation: cardOffset
                )
                .frame(height: max(cardHeight, 330))
                .padding(.horizontal, 24)
                .offset(cardOffset)
                .rotationEffect(.degrees(Double(cardOffset.width) / 22))
                .allowsHitTesting(!isAnimatingManualSwipe)
                .gesture(practiceGesture)

                teachingLabel
                    .allowsHitTesting(false)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.horizontal, Spacing.xs)
    }

    private var teachingLabel: some View {
        VStack(spacing: 2) {
            Text(demo.phase.label)
                .font(.dealyCondensedBlack(size: 28))
                .tracking(-0.4)
                .minimumScaleFactor(0.8)
            Text(demo.phase.instruction)
                .font(.caption.weight(.semibold))
        }
        .foregroundStyle(labelColor)
        .shadow(color: .black.opacity(0.62), radius: 10, y: 3)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: labelAlignment)
        .padding(labelInsets)
        .animation(.easeInOut(duration: 0.3), value: demo.phase)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(demo.phase.label). \(demo.phase.instruction)")
    }

    private var labelColor: Color {
        switch demo.phase {
        case .details: .white
        case .pass: Theme.skip
        case .save: Theme.saveSoft
        case .useNow: Theme.bright
        }
    }

    private var labelAlignment: Alignment {
        switch demo.phase {
        case .details, .useNow: .bottom
        case .pass: .leading
        case .save: .trailing
        }
    }

    private var labelInsets: EdgeInsets {
        switch demo.phase {
        case .details, .useNow:
            EdgeInsets(top: 0, leading: 24, bottom: 8, trailing: 24)
        case .pass:
            EdgeInsets(top: 0, leading: 2, bottom: 46, trailing: 0)
        case .save:
            EdgeInsets(top: 0, leading: 0, bottom: 46, trailing: 2)
        }
    }

    private var practiceGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard !isAnimatingManualSwipe else { return }
                if !demo.isInterrupted {
                    interruptDemo()
                }
                dragOffset = value.translation
            }
            .onEnded { value in
                guard !isAnimatingManualSwipe else { return }

                if isTap(value.translation) {
                    dragOffset = .zero
                    Haptics.selection()
                    showDetails = true
                    scheduleDemo(after: .milliseconds(2500))
                    return
                }

                let intent = DealSwipeGesture.intent(
                    translation: value.translation,
                    predictedEndTranslation: value.predictedEndTranslation
                )
                handle(intent)
            }
    }

    private func isTap(_ translation: CGSize) -> Bool {
        abs(translation.width) < 8 && abs(translation.height) < 8
    }

    private func handle(_ intent: DealSwipeIntent) {
        switch intent {
        case .bye:
            Haptics.impact(.light)
            animateCardAway(x: -650)
        case .save:
            Haptics.impact(.medium)
            animateCardAway(x: 650)
        case .getDeal:
            Haptics.impact(.medium)
            resetCard()
            showUseNow = true
            scheduleDemo(after: .milliseconds(2500))
        case .rest:
            resetCard()
            scheduleDemo(after: .milliseconds(2500))
        }
    }

    private func interruptDemo() {
        demoTask?.cancel()
        demo.interrupt()
    }

    private func scheduleDemo(after delay: Duration = .zero) {
        demoTask?.cancel()
        demoTask = Task { @MainActor in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }

            dragOffset = .zero
            demoNudge = .zero
            demo.resumeFromBeginning()

            // Each phase: show its instruction, nudge the card slightly toward the
            // gesture, hold, then settle back to rest before advancing. Four phases
            // at ~1.3s each loop in roughly five seconds. The card is never dismissed
            // and no sheet opens automatically.
            while !Task.isCancelled && !demo.isInterrupted {
                let target = reduceMotion ? .zero : demo.offset(reduceMotion: reduceMotion)

                withAnimation(.easeInOut(duration: reduceMotion ? 0 : 0.4)) {
                    demoNudge = target
                }
                try? await Task.sleep(for: .milliseconds(650))
                guard !Task.isCancelled && !demo.isInterrupted else { return }

                withAnimation(.easeInOut(duration: reduceMotion ? 0 : 0.4)) {
                    demoNudge = .zero
                }
                try? await Task.sleep(for: .milliseconds(650))
                guard !Task.isCancelled && !demo.isInterrupted else { return }

                demo.advance()
            }
        }
    }

    private func animateCardAway(x: CGFloat) {
        guard !isAnimatingManualSwipe else { return }
        isAnimatingManualSwipe = true

        let finish = {
            dragOffset = .zero
            isAnimatingManualSwipe = false
            scheduleDemo(after: .milliseconds(2500))
        }

        guard !reduceMotion else {
            finish()
            return
        }

        withAnimation(.easeIn(duration: 0.22)) {
            dragOffset = CGSize(width: x, height: 30)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
            finish()
        }
    }

    private func resetCard() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.72)) {
            dragOffset = .zero
        }
    }
}

private struct PracticeUseNowView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            Spacer()
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 68, weight: .bold))
                .foregroundStyle(Theme.primary)

            Text("USE IT NOW")
                .font(.system(size: 42, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.primaryText)

            Text("On a real deal, swiping up takes you straight to the redemption step—merchant link, coupon, directions, or checkout.")
                .font(.title3)
                .foregroundStyle(Theme.mutedText)
                .lineSpacing(4)

            Spacer()

            Button("Got it") { dismiss() }
                .buttonStyle(.primaryDealy)
        }
        .padding(Spacing.xl)
        .background(Theme.background.ignoresSafeArea())
        .presentationDetents([.medium])
    }
}
