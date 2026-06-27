import SwiftUI
import CoreLocation

/// The lightweight "Cheap Food Run": pick an intent ("Where should I eat right
/// now?") and Dealy returns a single best place with an estimated cost, the
/// reasoning, a budget tip, and any matched restaurant deal. Presented as a
/// `fullScreenCover`; `onClose` dismisses it.
struct FoodRunView: View {
    @Environment(AppState.self) private var app

    let onClose: () -> Void

    @State private var intent: FoodRunIntent?
    @State private var result: FoodRunResult?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.xl) {
                    intro
                    intentSection
                    if isLoading { ProgressView().frame(maxWidth: .infinity).padding(.top, Spacing.xl) }
                    if let result { resultCard(result) }
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Cheap Food Run")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { onClose() }
                }
            }
            .alert("Couldn't find a spot", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Where should I eat right now?")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Text("Pick a vibe and Dealy picks the spot — with what to order to stay on budget.")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
        }
    }

    private var intentSection: some View {
        FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
            ForEach(FoodRunIntent.allCases) { option in
                SelectableChip(title: option.displayName, systemImage: option.icon,
                               isSelected: intent == option) {
                    Haptics.selection()
                    intent = option
                    Task { await fetch(option) }
                }
            }
        }
    }

    private func resultCard(_ result: FoodRunResult) -> some View {
        DealyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack {
                    Text(result.place.name)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Theme.primaryText)
                    Spacer()
                    ConfidenceBadge(confidence: result.confidence)
                }

                HStack(spacing: Spacing.xs) {
                    if let bucket = result.place.priceBucket {
                        InfoChip(symbol: "dollarsign", text: bucket, tint: Theme.primary)
                    }
                    if let rating = result.place.rating {
                        InfoChip(symbol: "star.fill", text: String(format: "%.1f", rating), tint: Theme.watch)
                    }
                    if let cost = result.estimatedCost {
                        InfoChip(symbol: "creditcard", text: "~\(Format.price(cost))", tint: Theme.save)
                    }
                }

                if !result.reason.isEmpty {
                    Text(result.reason)
                        .font(.subheadline)
                        .foregroundStyle(Theme.primaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let tip = result.place.budgetTipDisplay {
                    Label(tip, systemImage: "lightbulb.fill")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let deal = result.matchedDeal {
                    InfoChip(symbol: "tag.fill",
                             text: "\(deal.merchant): \(deal.title)",
                             tint: Theme.save, filled: true)
                }

                if result.place.hasCoordinates {
                    Button { openDirections(to: result.place) } label: {
                        Label("Open in Maps", systemImage: "map.fill")
                    }
                    .buttonStyle(SecondaryButtonStyle(fullWidth: true))
                    .padding(.top, Spacing.xxs)
                }
            }
        }
    }

    private func fetch(_ intent: FoodRunIntent) async {
        isLoading = true
        defer { isLoading = false }
        let request = app.makeFoodRunRequest(intent: intent)
        do {
            let result = try await app.fetchFoodRun(request)
            withAnimation { self.result = result }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func openDirections(to place: Place) {
        guard let lat = place.latitude, let lng = place.longitude else { return }
        Haptics.selection()
        DirectionsLauncher.open(to: CLLocationCoordinate2D(latitude: lat, longitude: lng), name: place.name)
    }
}
