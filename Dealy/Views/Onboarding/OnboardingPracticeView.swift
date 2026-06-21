import SwiftUI

struct OnboardingPracticeView: View {
    var onFinish: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var tutorial = PracticeTutorialState()
    @State private var dragOffset: CGSize = .zero
    @State private var isAnimating = false
    @State private var showDetails = false
    @State private var showUseNow = false

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

    var body: some View {
        VStack(spacing: 0) {
            header
            practiceStage

            VStack(spacing: Spacing.sm) {
                Text(tutorial.isComplete
                     ? "You’ve got it."
                     : "\(tutorial.completedActions.count) of \(PracticeTutorialAction.allCases.count) moves learned")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(tutorial.isComplete ? Theme.save : Theme.mutedText)
                    .contentTransition(.numericText())

                Button("Start exploring", action: onFinish)
                    .buttonStyle(.primaryDealy)
                    .disabled(!tutorial.isComplete)
                    .opacity(tutorial.isComplete ? 1 : 0.42)
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
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("TRY THE CARD")
                .font(.dealyCondensedBlack(size: 40))
                .tracking(-0.9)
                .foregroundStyle(Theme.primaryText)
            Text("Move it exactly like you’ll use Dealy. Each instruction disappears once you do it.")
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
            let cardHeight = min(proxy.size.height - 62, 500)

            ZStack {
                SwipeCardView(
                    deal: Self.practiceDeal,
                    campus: .atlanta,
                    dragTranslation: dragOffset
                )
                .frame(height: max(cardHeight, 330))
                .padding(.horizontal, 24)
                .offset(dragOffset)
                .rotationEffect(.degrees(Double(dragOffset.width) / 20))
                .allowsHitTesting(!isAnimating)
                .gesture(practiceDragGesture)
                .onTapGesture {
                    guard !isAnimating else { return }
                    tutorial.complete(.viewDetails)
                    Haptics.selection()
                    showDetails = true
                }

                guideText
                    .allowsHitTesting(false)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.horizontal, Spacing.xs)
    }

    private var guideText: some View {
        ZStack {
            if tutorial.remainingActions.contains(.pass) {
                gestureLabel(
                    eyebrow: "NOT FOR ME",
                    title: "← PASS",
                    color: Theme.skip,
                    alignment: .leading
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .padding(.leading, 2)
                .offset(y: -40)
                .transition(.opacity.combined(with: .move(edge: .leading)))
            }

            if tutorial.remainingActions.contains(.save) {
                gestureLabel(
                    eyebrow: "KEEP IT",
                    title: "SAVE →",
                    color: Theme.saveSoft,
                    alignment: .trailing
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                .padding(.trailing, 2)
                .offset(y: -40)
                .transition(.opacity.combined(with: .move(edge: .trailing)))
            }

            VStack(spacing: 5) {
                if tutorial.remainingActions.contains(.useNow) {
                    gestureLabel(
                        eyebrow: "READY NOW",
                        title: "↑ USE DEAL",
                        color: Theme.bright,
                        alignment: .center
                    )
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                if tutorial.remainingActions.contains(.viewDetails) {
                    Text("TAP THE CARD FOR DETAILS")
                        .font(.caption.weight(.bold))
                        .tracking(0.8)
                        .foregroundStyle(Theme.mutedText)
                        .transition(.opacity)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, 2)
        }
        .animation(.easeOut(duration: 0.22), value: tutorial)
    }

    private func gestureLabel(
        eyebrow: String,
        title: String,
        color: Color,
        alignment: HorizontalAlignment
    ) -> some View {
        VStack(alignment: alignment, spacing: 0) {
            Text(eyebrow)
                .font(.system(size: 8, weight: .bold))
                .tracking(0.8)
            Text(title)
                .font(.dealyCondensedBlack(size: 22))
                .tracking(-0.3)
        }
        .foregroundStyle(color)
        .shadow(color: .black.opacity(0.46), radius: 8, y: 2)
        .accessibilityHidden(true)
    }

    private var practiceDragGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                guard !isAnimating else { return }
                dragOffset = value.translation
            }
            .onEnded { value in
                guard !isAnimating else { return }
                let intent = DealSwipeGesture.intent(
                    translation: value.translation,
                    predictedEndTranslation: value.predictedEndTranslation
                )
                guard let action = PracticeTutorialAction(intent: intent) else {
                    resetCard()
                    return
                }
                completeSwipe(action)
            }
    }

    private func completeSwipe(_ action: PracticeTutorialAction) {
        tutorial.complete(action)
        Haptics.impact(action == .pass ? .light : .medium)

        switch action {
        case .pass:
            animateCardAway(x: -650)
        case .save:
            animateCardAway(x: 650)
        case .useNow:
            resetCard()
            showUseNow = true
        case .viewDetails:
            break
        }
    }

    private func animateCardAway(x: CGFloat) {
        guard !isAnimating else { return }
        isAnimating = true
        let finish = {
            dragOffset = .zero
            isAnimating = false
        }

        if reduceMotion {
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
                .font(.dealyCondensedBlack(size: 42))
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
