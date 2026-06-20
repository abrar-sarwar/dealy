import SwiftUI

struct OnboardingPage {
    let symbol: String
    let title: String
    let subtitle: String
    let tint: [Color]

    static let page1 = OnboardingPage(
        symbol: "mappin.and.ellipse",
        title: "Find deals around you",
        subtitle: "Discover food, groceries, local events, and more — verified and near your current location.",
        tint: [Color(hex: 0x3B82F6), Color(hex: 0x1D4ED8)]
    )
    static let page2 = OnboardingPage(
        symbol: "hand.draw.fill",
        title: "Swipe to save",
        subtitle: "Like deals you want, skip what you don’t, and build your personalized savings feed.",
        tint: [Color(hex: 0x22C55E), Color(hex: 0x15803D)]
    )
    static let page3 = OnboardingPage(
        symbol: "chart.line.uptrend.xyaxis",
        title: "Track your savings",
        subtitle: "See how much money Dealy helps you save every week.",
        tint: [Color(hex: 0xF59E0B), Color(hex: 0xB45309)]
    )
}

struct OnboardingIntroView: View {
    let page: OnboardingPage
    let pageIndex: Int
    let pageCount: Int
    var onSkip: () -> Void
    var onContinue: () -> Void

    @State private var appear = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Skip", action: onSkip)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.mutedText)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.sm)

            Spacer()

            ZStack {
                Circle()
                    .fill(LinearGradient(colors: page.tint, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 168, height: 168)
                    .dealyShadow(.card)
                Image(systemName: page.symbol)
                    .font(.system(size: 72, weight: .semibold))
                    .foregroundStyle(.white)
                    .symbolRenderingMode(.hierarchical)
            }
            .scaleEffect(appear ? 1 : 0.85)
            .opacity(appear ? 1 : 0)

            VStack(spacing: Spacing.sm) {
                Text(page.title)
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.primaryText)
                Text(page.subtitle)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.mutedText)
                    .padding(.horizontal, Spacing.lg)
            }
            .padding(.top, Spacing.xl)
            .opacity(appear ? 1 : 0)
            .offset(y: appear ? 0 : 14)

            Spacer()

            PageDots(count: pageCount, index: pageIndex)
                .padding(.bottom, Spacing.lg)

            Button(action: onContinue) {
                Text(pageIndex == pageCount - 1 ? "Get started" : "Continue")
            }
            .buttonStyle(.primaryDealy)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xl)
        }
        .onAppear {
            appear = false
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { appear = true }
        }
    }
}

/// Native-feeling page indicator dots.
struct PageDots: View {
    let count: Int
    let index: Int
    var body: some View {
        HStack(spacing: Spacing.xs) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(i == index ? Theme.primary : Theme.separator)
                    .frame(width: i == index ? 22 : 8, height: 8)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: index)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Page \(index + 1) of \(count)")
    }
}
