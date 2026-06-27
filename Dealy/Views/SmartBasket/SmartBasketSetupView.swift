import SwiftUI

/// The Smart Basket quick-card quiz: goal → budget → timeframe → optional
/// preferences → Generate. One tap builds the basket. Presented as a
/// `fullScreenCover`; `onClose` dismisses the whole flow.
struct SmartBasketSetupView: View {
    @Environment(AppState.self) private var app

    let onClose: () -> Void

    @State private var goal: BasketGoal = .cheapest
    @State private var budget: BasketBudget = .thirtyFive
    @State private var customBudget = 40
    @State private var timeframe: BasketTimeframe = .threeDays
    @State private var dietary: Set<DietaryPreference> = []

    @State private var isGenerating = false
    @State private var errorMessage: String?
    @State private var generatedBasket: SmartBasket?
    @State private var lastRequest: BasketRequest?

    private var budgetDollars: Int { budget.presetDollars ?? customBudget }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.xl) {
                    intro
                    goalSection
                    budgetSection
                    timeframeSection
                    dietarySection
                    generateButton
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Smart Basket")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onClose() }
                }
            }
            .navigationDestination(item: $generatedBasket) { basket in
                GeneratedBasketView(basket: basket, request: lastRequest, onClose: onClose)
            }
            .alert("Couldn't build your basket", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: Sections

    private var intro: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("What kind of grocery run do you need?")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Text("Tell Dealy your budget and goal. We'll build the list, find matching deals, and tell you where to go.")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
        }
    }

    private var goalSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Goal", symbol: "target")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(BasketGoal.allCases) { option in
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
            SectionHeader(title: "Budget", symbol: "dollarsign.circle")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(BasketBudget.allCases) { option in
                    SelectableChip(title: option.displayName, systemImage: option.icon,
                                   isSelected: budget == option) {
                        Haptics.selection(); budget = option
                    }
                }
            }
            if budget == .custom {
                HStack {
                    Text(Format.moneyWhole(Decimal(customBudget)))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Theme.primary)
                    Spacer()
                    Stepper("Custom budget", value: $customBudget, in: 10...200, step: 5)
                        .labelsHidden()
                }
                .padding(.top, Spacing.xxs)
            }
        }
    }

    private var timeframeSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "How long should it last?", symbol: "calendar")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(BasketTimeframe.allCases) { option in
                    SelectableChip(title: option.displayName, systemImage: option.icon,
                                   isSelected: timeframe == option) {
                        Haptics.selection(); timeframe = option
                    }
                }
            }
        }
    }

    private var dietarySection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Preferences (optional)", symbol: "slider.horizontal.3")
            FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                ForEach(DietaryPreference.allCases) { option in
                    SelectableChip(title: option.displayName, systemImage: option.icon,
                                   isSelected: dietary.contains(option)) {
                        Haptics.selection()
                        if dietary.contains(option) { dietary.remove(option) } else { dietary.insert(option) }
                    }
                }
            }
        }
    }

    private var generateButton: some View {
        Button { Task { await generate() } } label: {
            if isGenerating {
                ProgressView().tint(.white)
            } else {
                Label("Build my basket", systemImage: "sparkles")
            }
        }
        .buttonStyle(.primaryDealy)
        .disabled(isGenerating)
        .padding(.top, Spacing.sm)
    }

    // MARK: Generate

    private func generate() async {
        isGenerating = true
        defer { isGenerating = false }
        let request = app.makeBasketRequest(
            goal: goal,
            budgetDollars: budgetDollars,
            timeframe: timeframe,
            dietary: Array(dietary)
        )
        do {
            let basket = try await app.generateBasket(request)
            lastRequest = request
            generatedBasket = basket
            Haptics.impact(.medium)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
