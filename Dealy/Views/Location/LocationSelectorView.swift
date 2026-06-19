import SwiftUI

/// Location & radius picker. Applies on Done so saved deals and feed update
/// together. Saved deals are never affected by changing location.
struct LocationSelectorView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var selected: Campus = .georgiaState
    @State private var radius: Int = 3

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.sm) {
                    Text("Your campus or city sets which mock deals appear nearby. Changing it won’t remove anything you’ve saved.")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, Spacing.xs)

                    ForEach(Campus.all) { campus in
                        CampusRow(campus: campus, isSelected: campus.id == selected.id) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                selected = campus
                                radius = campus.defaultRadius
                            }
                            Haptics.selection()
                        }
                    }

                    DealyCard {
                        RadiusControl(radius: $radius)
                    }
                    .padding(.top, Spacing.xs)
                }
                .padding(Spacing.lg)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        app.selectCampus(selected, radius: radius)
                        Haptics.impact(.light)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                selected = app.currentCampus
                radius = app.radius
            }
        }
    }
}
