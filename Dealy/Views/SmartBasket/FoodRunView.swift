import SwiftUI

/// The Food Run flow coordinator: setup quiz → loading → result. Pick a goal
/// ("Where should I eat right now?") and Dealy returns a single best place with
/// an estimated cost, the reasoning, what to order, ranked alternatives, and any
/// matched restaurant deal. Presented as a `fullScreenCover`; `onClose` dismisses.
///
/// When `presetGoal` is provided (decision-card deep links), the setup is skipped
/// and the result is fetched immediately for that goal.
struct FoodRunView: View {
    @Environment(AppState.self) private var app

    let onClose: () -> Void
    var presetGoal: FoodRunIntent? = nil

    @State private var result: FoodRunResult?
    @State private var lastRequest: FoodRunRequest?
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var didRunPreset = false

    var body: some View {
        NavigationStack {
            FoodRunSetupView(isWorking: isWorking) { request in
                Task { await run(request) }
            }
            .navigationTitle("Food Run")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onClose() }
                }
            }
            .navigationDestination(item: $result) { res in
                FoodRunResultView(
                    result: res,
                    isWorking: isWorking,
                    onRegenerate: { Task { await regenerate() } },
                    onClose: onClose
                )
            }
            .alert("Couldn't find a spot", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
            .task {
                guard let presetGoal, !didRunPreset else { return }
                didRunPreset = true
                await run(app.makeFoodRunRequest(goal: presetGoal))
            }
        }
    }

    private func run(_ request: FoodRunRequest) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let fresh = try await app.fetchFoodRun(request)
            lastRequest = request
            withAnimation { result = fresh }
            Haptics.impact(.medium)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func regenerate() async {
        guard let request = lastRequest else { return }
        await run(request)
        Haptics.impact(.light)
    }
}
