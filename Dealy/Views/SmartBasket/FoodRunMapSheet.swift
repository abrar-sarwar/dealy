import SwiftUI
import MapKit
import CoreLocation

/// A focused map of a Food Run result: the selected place plus its ranked
/// alternatives, rendered as photo pins (real Google photos when available,
/// category artwork otherwise). The selected pin is highlighted; tapping any pin
/// re-selects it and updates the bottom preview card, which offers turn-by-turn
/// directions via `DirectionsLauncher`. Presented as a sheet from the result
/// screen — the lower-risk option (no changes to the main Map tab).
struct FoodRunMapSheet: View {
    @Environment(\.dismiss) private var dismiss

    let result: FoodRunResult

    @State private var position: MapCameraPosition
    @State private var selectedID: String

    init(result: FoodRunResult) {
        self.result = result
        _selectedID = State(initialValue: result.place.id)
        if let lat = result.place.latitude, let lng = result.place.longitude {
            _position = State(initialValue: .region(MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                latitudinalMeters: 2200, longitudinalMeters: 2200)))
        } else {
            _position = State(initialValue: .automatic)
        }
    }

    /// The selected place + alternatives that actually have coordinates to map.
    private var mappablePlaces: [Place] {
        ([result.place] + result.alternatives).filter { $0.hasCoordinates }
    }

    private var selectedPlace: Place? {
        mappablePlaces.first { $0.id == selectedID } ?? mappablePlaces.first
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                map
                if let place = selectedPlace {
                    previewCard(place)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.bottom, Spacing.lg)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .navigationTitle("On the map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.subheadline.weight(.semibold))
                }
            }
        }
    }

    private var map: some View {
        Map(position: $position) {
            ForEach(mappablePlaces) { place in
                if let coord = coordinate(for: place) {
                    Annotation(place.name, coordinate: coord) {
                        FoodRunMapPin(place: place,
                                      selected: place.id == selectedID,
                                      isPick: place.id == result.place.id)
                            .onTapGesture {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    selectedID = place.id
                                }
                                Haptics.selection()
                            }
                    }
                    .annotationTitles(.hidden)
                }
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .ignoresSafeArea(edges: .bottom)
    }

    private func previewCard(_ place: Place) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            PlaceImage(photoURL: place.primaryPhotoUrl,
                       category: place.category, seed: place.visualSeed)
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: Spacing.xs) {
                    Text(place.name)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(1)
                    if place.id == result.place.id {
                        InfoChip(symbol: "rosette", text: "Top pick", tint: Theme.primary)
                    }
                }
                if let why = place.whyRecommended, !why.isEmpty {
                    Text(why)
                        .font(.caption2)
                        .foregroundStyle(Theme.mutedText)
                        .lineLimit(2)
                }
                if place.hasCoordinates {
                    Button { openDirections(to: place) } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                            Text("Directions")
                        }
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.vertical, 6).padding(.horizontal, Spacing.sm)
                        .background(Theme.primary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                    .accessibilityLabel("Directions to \(place.name)")
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.sm)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
            .stroke(Theme.primary.opacity(0.25), lineWidth: 1))
        .dealyShadow(.soft)
    }

    private func coordinate(for place: Place) -> CLLocationCoordinate2D? {
        guard let lat = place.latitude, let lng = place.longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    private func openDirections(to place: Place) {
        guard let coord = coordinate(for: place) else { return }
        Haptics.selection()
        DirectionsLauncher.open(to: coord, name: place.name)
    }
}

/// A circular PHOTO pin for a Food Run place — the real place photo ringed in a
/// status color (Top pick = green, alternative = blue), falling back to category
/// artwork when there's no photo. Mirrors the Map tab's `PlaceMapPin` styling;
/// grows + brightens when selected.
private struct FoodRunMapPin: View {
    let place: Place
    let selected: Bool
    let isPick: Bool

    private var size: CGFloat { selected ? 54 : 40 }
    private var ring: Color { isPick ? Theme.save : Theme.primary }

    var body: some View {
        PlaceImage(photoURL: place.primaryPhotoUrl,
                   category: place.category, seed: place.visualSeed)
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().stroke(ring, lineWidth: selected ? 4 : 3))
            .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 1))
            .shadow(color: .black.opacity(0.4), radius: selected ? 7 : 3, y: 2)
            .accessibilityLabel("\(place.name)\(isPick ? ", top pick" : "")")
    }
}
