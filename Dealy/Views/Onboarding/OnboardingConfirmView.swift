import SwiftUI

struct OnboardingConfirmView: View {
    let campus: Campus
    let radius: Int
    let interests: Set<DealCategory>
    var onFinish: () -> Void

    @State private var appear = false

    private var interestList: [DealCategory] {
        DealCategory.allCases.filter { interests.contains($0) }
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            ZStack {
                Circle().fill(Theme.brandGradient).frame(width: 110, height: 110)
                Image(systemName: "checkmark")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.white)
            }
            .scaleEffect(appear ? 1 : 0.7)
            .opacity(appear ? 1 : 0)

            Text("You’re all set")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.primaryText)
                .padding(.top, Spacing.lg)

            Text("Here’s your starting setup.")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)

            DealyCard {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    summaryRow(symbol: "mappin.circle.fill",
                               title: campus.name,
                               detail: "\(campus.cityContext) · \(radius) mi radius")
                    Divider()
                    HStack(alignment: .top, spacing: Spacing.sm) {
                        Image(systemName: "heart.fill")
                            .foregroundStyle(Theme.primary)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: Spacing.xs) {
                            Text("Your interests").font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.primaryText)
                            if interestList.isEmpty {
                                Text("None yet — we’ll show a bit of everything.")
                                    .font(.caption).foregroundStyle(Theme.mutedText)
                            } else {
                                FlowChips(items: interestList.map { $0.displayName })
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.xl)
            .opacity(appear ? 1 : 0)
            .offset(y: appear ? 0 : 16)

            Spacer()

            Button("Start saving", action: onFinish)
                .buttonStyle(.primaryDealy)
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.xl)
        }
        .background(Theme.background.ignoresSafeArea())
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.75)) { appear = true }
        }
    }

    private func summaryRow(symbol: String, title: String, detail: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: symbol).foregroundStyle(Theme.primary).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.primaryText)
                Text(detail).font(.caption).foregroundStyle(Theme.mutedText)
            }
            Spacer()
        }
    }
}

/// Simple wrapping chips layout for short labels.
struct FlowChips: View {
    let items: [String]
    var body: some View {
        FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.primary)
                    .padding(.vertical, 5)
                    .padding(.horizontal, Spacing.sm)
                    .background(Capsule().fill(Theme.primary.opacity(0.12)))
            }
        }
    }
}
