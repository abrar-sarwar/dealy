import SwiftUI

struct DealyPlusView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPlan: Plan = .student
    @State private var showComingSoon = false

    enum Plan: String, CaseIterable, Identifiable {
        case student, regular
        var id: String { rawValue }
        var title: String { self == .student ? "Student Plan" : "Regular Plan" }
        var price: String { self == .student ? "$2.99" : "$5.99" }
        var subtitle: String { self == .student ? "Verified students" : "Everyone" }
    }

    private let features: [(String, String)] = [
        ("bell.badge.fill", "Instant deal alerts"),
        ("eye.fill", "Unlimited deal watches"),
        ("sparkles", "AI deal recommendations"),
        ("chart.xyaxis.line", "Price history"),
        ("scope", "Expanded search radius"),
        ("star.fill", "Exclusive offers"),
        ("slider.horizontal.3", "Advanced filters"),
        ("bolt.fill", "Early access to limited deals"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    hero
                    featureList
                    planPicker
                    Button {
                        Haptics.impact()
                        showComingSoon = true
                    } label: {
                        Text("Get Dealy+ · \(selectedPlan.price)/mo")
                    }
                    .buttonStyle(.primaryDealy)

                    Text("This is a frontend preview. No purchase will be made, and all core Dealy features stay free.")
                        .font(.caption2)
                        .foregroundStyle(Theme.faintText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Spacing.lg)
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Dealy+")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
            .alert("Payments coming soon", isPresented: $showComingSoon) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("This is a frontend preview — subscriptions arrive with backend integration.")
            }
        }
    }

    private var hero: some View {
        VStack(spacing: Spacing.sm) {
            ZStack {
                RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
                    .fill(Theme.brandGradient)
                    .frame(height: 150)
                    .dealyShadow(.card)
                VStack(spacing: Spacing.xs) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(.white)
                    Text("Dealy+")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                }
            }
            Text("Save more with smarter alerts and unlimited deal tracking.")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
                .multilineTextAlignment(.center)
        }
    }

    private var featureList: some View {
        VStack(spacing: 0) {
            ForEach(Array(features.enumerated()), id: \.offset) { index, feature in
                HStack(spacing: Spacing.sm) {
                    Image(systemName: feature.0)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.primary)
                        .frame(width: 28)
                    Text(feature.1)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.primaryText)
                    Spacer()
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.save)
                }
                .padding(.vertical, Spacing.sm)
                if index < features.count - 1 { Divider() }
            }
        }
        .padding(Spacing.md)
        .dealyCardSurface()
    }

    private var planPicker: some View {
        HStack(spacing: Spacing.sm) {
            ForEach(Plan.allCases) { plan in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { selectedPlan = plan }
                    Haptics.selection()
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(plan.title).font(.subheadline.weight(.bold))
                            Spacer()
                            Image(systemName: selectedPlan == plan ? "largecircle.fill.circle" : "circle")
                                .foregroundStyle(selectedPlan == plan ? Theme.primary : Theme.separator)
                        }
                        Text(plan.price).font(.system(.title2, design: .rounded, weight: .bold))
                            .foregroundStyle(Theme.primaryText)
                        Text("per month · \(plan.subtitle)").font(.caption).foregroundStyle(Theme.mutedText)
                    }
                    .foregroundStyle(Theme.primaryText)
                    .padding(Spacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).fill(Theme.surface))
                    .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                        .stroke(selectedPlan == plan ? Theme.primary : Theme.separator,
                                lineWidth: selectedPlan == plan ? 2 : 0.75))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(plan.title), \(plan.price) per month")
                .accessibilityAddTraits(selectedPlan == plan ? [.isButton, .isSelected] : .isButton)
            }
        }
    }
}
