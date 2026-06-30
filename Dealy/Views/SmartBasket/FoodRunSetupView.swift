import SwiftUI

/// Distance presets for the Food Run quiz, mapped to `maxDistanceMiles`.
private enum FoodRunDistance: String, CaseIterable, Identifiable {
    case walking
    case fiveMin
    case tenMin
    case custom

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .walking: return "Walking"
        case .fiveMin: return "5 min"
        case .tenMin: return "10 min"
        case .custom: return "Custom"
        }
    }

    var icon: String {
        switch self {
        case .walking: return "figure.walk"
        case .fiveMin: return "car.fill"
        case .tenMin: return "car.2.fill"
        case .custom: return "slider.horizontal.3"
        }
    }

    /// Resolved distance in miles for the preset (nil for custom — the caller
    /// supplies the slider value instead).
    var miles: Double? {
        switch self {
        case .walking: return 0.5
        case .fiveMin: return 1.5
        case .tenMin: return 3.0
        case .custom: return nil
        }
    }
}

/// The Food Run quiz: "What kind of food run do you need?" → goal chips, then
/// optional budget / distance / vibe → "Find food". Builds a `FoodRunRequest`
/// from the current discovery center and hands it to the coordinator via
/// `onSubmit`. Mirrors `SmartBasketSetupView`.
struct FoodRunSetupView: View {
    @Environment(AppState.self) private var app

    var isWorking: Bool
    let onSubmit: (FoodRunRequest) -> Void

    @State private var goal: FoodRunIntent = .bestValue
    @State private var budget: Int?
    @State private var customBudget = 25
    @State private var distance: FoodRunDistance?
    @State private var customDistance = 2.0
    @State private var vibe: FoodRunVibe?

    private static let budgetPresets = [5, 10, 15, 20]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                intro
                goalSection
                budgetSection
                distanceSection
                vibeSection
                findButton
            }
            .padding(Spacing.lg)
        }
        .background(Theme.background.ignoresSafeArea())
    }

    // MARK: Sections

    private var intro: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Where should I eat right now?")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Text("Pick a goal and Dealy picks the spot — with what to order to stay on budget.")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
        }
    }

    private var goalSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "What kind of food run do you need?", symbol: "fork.knife")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(FoodRunIntent.allCases) { option in
                    SelectableChip(title: option.displayName, systemImage: option.icon,
                                   isSelected: goal == option) {
                        Haptics.selection(); goal = option
                    }
                }
            }
        }
    }

    private var budgetSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Budget (optional)", symbol: "dollarsign.circle")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(Self.budgetPresets, id: \.self) { amount in
                    SelectableChip(title: "$\(amount)", systemImage: "dollarsign",
                                   isSelected: budget == amount) {
                        Haptics.selection()
                        budget = (budget == amount) ? nil : amount
                    }
                }
                SelectableChip(title: "Custom", systemImage: "slider.horizontal.3",
                               isSelected: budget != nil && !Self.budgetPresets.contains(budget!)) {
                    Haptics.selection(); budget = customBudget
                }
            }
            if let budget, !Self.budgetPresets.contains(budget) {
                HStack {
                    Text(Format.moneyWhole(Decimal(customBudget)))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Theme.primary)
                    Spacer()
                    Stepper("Custom budget", value: $customBudget, in: 5...100, step: 5)
                        .labelsHidden()
                        .onChange(of: customBudget) { _, new in self.budget = new }
                }
                .padding(.top, Spacing.xxs)
            }
        }
    }

    private var distanceSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "How far (optional)", symbol: "location")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(FoodRunDistance.allCases) { option in
                    SelectableChip(title: option.displayName, systemImage: option.icon,
                                   isSelected: distance == option) {
                        Haptics.selection()
                        distance = (distance == option) ? nil : option
                    }
                }
            }
            if distance == .custom {
                HStack {
                    Text(String(format: "%.1f mi", customDistance))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Theme.primary)
                    Spacer()
                    Stepper("Custom distance", value: $customDistance, in: 0.5...10, step: 0.5)
                        .labelsHidden()
                }
                .padding(.top, Spacing.xxs)
            }
        }
    }

    private var vibeSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Vibe (optional)", symbol: "sparkles")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(FoodRunVibe.allCases) { option in
                    SelectableChip(title: option.displayName, systemImage: option.icon,
                                   isSelected: vibe == option) {
                        Haptics.selection()
                        vibe = (vibe == option) ? nil : option
                    }
                }
            }
        }
    }

    private var findButton: some View {
        Button { submit() } label: {
            if isWorking {
                ProgressView().tint(.white)
            } else {
                Label("Find food", systemImage: "fork.knife")
            }
        }
        .buttonStyle(.primaryDealy)
        .disabled(isWorking)
        .padding(.top, Spacing.sm)
    }

    // MARK: Submit

    private func submit() {
        let miles: Double?
        switch distance {
        case .custom: miles = customDistance
        case .some(let preset): miles = preset.miles
        case .none: miles = nil
        }
        let request = app.makeFoodRunRequest(
            goal: goal,
            budgetDollars: budget,
            maxDistanceMiles: miles,
            vibe: vibe
        )
        Haptics.impact(.medium)
        onSubmit(request)
    }
}
