import SwiftUI

/// The filter sheet behind the map's Filter button. Edits a bound `MapFilterState`
/// live (the map updates as selections change) and offers a Reset back to defaults.
/// Category/sort are single-select; precision + the trailing toggles are booleans.
/// Radius is shown here too, bound to the SAME `radiusMiles` source of truth as the
/// map's always-visible slider — changing it in either place updates one value.
/// `availableCategories` lets the caller hide lanes with no inventory.
struct MapFilterSheet: View {
    @Binding var state: MapFilterState
    /// Shared search radius (miles) — the same value the map's slider drives.
    @Binding var radiusMiles: Int
    /// Categories worth offering for the current inventory (always includes `.all`).
    var availableCategories: [DealCategoryFilter] = DealCategoryFilter.allCases

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                radiusSection
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

    private var radiusSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Search radius").font(.subheadline.weight(.medium))
                    Spacer()
                    Text("\(radiusMiles) mi")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.primary)
                }
                Slider(
                    value: Binding(
                        get: { Double(radiusMiles) },
                        set: { radiusMiles = Int($0.rounded()) }
                    ),
                    in: Double(MapCameraModel.minRadiusMiles)...Double(MapCameraModel.maxRadiusMiles),
                    step: 1
                )
            }
        } header: {
            Text("Search range")
        } footer: {
            Text("Deals shown are within this radius — the same control as the slider on the map.")
        }
    }

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
