import SwiftUI

/// The filter sheet behind the map's Filter button. Edits a bound `MapFilterState`
/// live (the map updates as selections change) and offers a Reset back to defaults.
/// Category/sort are single-select; precision + the trailing toggles are booleans.
/// Radius is NOT here — it's the single always-visible slider on the map (one control,
/// not two). `availableCategories` lets the caller hide lanes with no inventory.
struct MapFilterSheet: View {
    @Binding var state: MapFilterState
    /// Categories worth offering for the current inventory (always includes `.all`).
    var availableCategories: [DealCategoryFilter] = DealCategoryFilter.allCases

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                categorySection
                dealTypeSection
                sortSection
                togglesSection
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") {
                        state = MapFilterState()
                        Haptics.selection()
                    }
                    .disabled(state.isDefault)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: Sections

    private var categorySection: some View {
        Section("Category") {
            Picker("Category", selection: $state.category) {
                ForEach(availableCategories) { c in
                    Label(c.label, systemImage: c.symbol).tag(c)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
        }
    }

    private var dealTypeSection: some View {
        Section {
            Picker("Deal type", selection: $state.exactOnly) {
                Text("Include approximate").tag(false)
                Text("Exact only").tag(true)
            }
            .pickerStyle(.segmented)
        } header: {
            Text("Deal type")
        } footer: {
            Text("Exact = real storefront coordinates. Approximate = region-level placement.")
        }
    }

    private var sortSection: some View {
        Section("Sort") {
            Picker("Sort", selection: $state.sort) {
                ForEach(MapFilterState.sortOptions) { s in
                    Label(s.label, systemImage: s.symbol).tag(s)
                }
            }
            .pickerStyle(.inline)
            .labelsHidden()
        }
    }

    private var togglesSection: some View {
        Section("Show only") {
            Toggle(isOn: $state.studentIDRequired) {
                Label("Student ID required", systemImage: "person.badge.shield.checkmark")
            }
            Toggle(isOn: $state.campusPerksOnly) {
                Label("Campus perks only", systemImage: "graduationcap.fill")
            }
            Toggle(isOn: $state.hasRealImage) {
                Label("Has real image", systemImage: "photo.fill")
            }
        }
        .tint(Theme.primary)
    }
}
