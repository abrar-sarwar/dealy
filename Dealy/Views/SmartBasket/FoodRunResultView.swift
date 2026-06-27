import SwiftUI
import CoreLocation

/// The Food Run result screen: the selected place (photo, confidence, ranking
/// label, tags, price/rating/cost/distance, why, what to order, matched deal,
/// trust label) followed by a ranked list of nearby alternatives and the action
/// row (Directions · Save place · Regenerate). Mirrors `GeneratedBasketView`.
struct FoodRunResultView: View {
    @Environment(AppState.self) private var app

    let result: FoodRunResult
    var isWorking: Bool
    let onRegenerate: () -> Void
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                selectedPlaceCard
                if !result.alternatives.isEmpty { alternativesSection }
                actionsSection
            }
            .padding(Spacing.lg)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Food Run")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { onClose() }
                    .font(.subheadline.weight(.semibold))
            }
        }
        .overlay { if isWorking { workingOverlay } }
    }

    // MARK: Selected place

    private var selectedPlaceCard: some View {
        let place = result.place
        return DealyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                PlaceImage(photoURL: place.primaryPhotoUrl,
                           category: place.category, seed: place.visualSeed)
                    .frame(height: 160)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

                HStack(alignment: .top) {
                    Text(place.name)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Theme.primaryText)
                    Spacer()
                    ConfidenceBadge(confidence: result.confidence)
                }

                if let label = result.rankingLabel, !label.isEmpty {
                    InfoChip(symbol: "rosette", text: label, tint: Theme.primary, filled: true)
                }

                if !result.tags.isEmpty {
                    FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
                        ForEach(result.tags, id: \.self) { tag in
                            InfoChip(symbol: "number", text: tag, tint: Theme.primary)
                        }
                    }
                }

                HStack(spacing: Spacing.xs) {
                    if let bucket = place.priceBucket, !bucket.isEmpty {
                        InfoChip(symbol: "dollarsign", text: bucket, tint: Theme.primary)
                    }
                    if let rating = place.rating {
                        InfoChip(symbol: "star.fill", text: String(format: "%.1f", rating), tint: Theme.watch)
                    }
                    if let cost = result.estimatedCost {
                        InfoChip(symbol: "creditcard", text: "~\(Format.price(cost))", tint: Theme.save)
                    }
                    if let distance = place.distanceDisplay {
                        InfoChip(symbol: "location.fill", text: distance, tint: Theme.primary)
                    }
                }

                if !result.reason.isEmpty {
                    Text(result.reason)
                        .font(.subheadline)
                        .foregroundStyle(Theme.primaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let order = result.recommendedOrder, !order.isEmpty {
                    Label(order, systemImage: "lightbulb.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                        .fixedSize(horizontal: false, vertical: true)
                } else if let tip = place.budgetTipDisplay {
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

                TrustLabelChip(label: result.sourceStatus)
            }
        }
    }

    // MARK: Alternatives

    private var alternativesSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "More options nearby", symbol: "list.bullet")
            VStack(spacing: Spacing.sm) {
                ForEach(result.alternatives) { place in
                    alternativeRow(place)
                }
            }
        }
    }

    private func alternativeRow(_ place: Place) -> some View {
        DealyCard(padding: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                PlaceImage(photoURL: place.primaryPhotoUrl,
                           category: place.category, seed: place.visualSeed)
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(place.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                        .lineLimit(1)
                    HStack(spacing: Spacing.xs) {
                        if let bucket = place.priceBucket, !bucket.isEmpty {
                            Text(bucket).font(.caption.weight(.semibold)).foregroundStyle(Theme.mutedText)
                        }
                        if let rating = place.rating {
                            Text(String(format: "★%.1f", rating)).font(.caption).foregroundStyle(Theme.mutedText)
                        }
                        if let distance = place.distanceDisplay {
                            Text(distance).font(.caption).foregroundStyle(Theme.mutedText)
                        }
                    }
                    if let why = place.whyRecommended, !why.isEmpty {
                        Text(why)
                            .font(.caption2)
                            .foregroundStyle(Theme.mutedText)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
                if place.hasCoordinates {
                    Button { openDirections(to: place) } label: {
                        Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                            .font(.title3)
                            .foregroundStyle(Theme.primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Directions to \(place.name)")
                }
            }
        }
    }

    // MARK: Actions

    private var isSaved: Bool { app.isPlaceSaved(result.place.id) }

    private var actionsSection: some View {
        VStack(spacing: Spacing.sm) {
            if result.place.hasCoordinates {
                Button { openDirections(to: result.place) } label: {
                    Label("Directions", systemImage: "map.fill")
                }
                .buttonStyle(.primaryDealy)
            }

            HStack(spacing: Spacing.sm) {
                Button { toggleSave() } label: {
                    Label(isSaved ? "Saved" : "Save place",
                          systemImage: isSaved ? "bookmark.fill" : "bookmark")
                }
                .buttonStyle(SecondaryButtonStyle(fullWidth: true))

                Button { onRegenerate() } label: {
                    Label("Regenerate", systemImage: "arrow.clockwise")
                }
                .buttonStyle(SecondaryButtonStyle(fullWidth: true))
                .disabled(isWorking)
            }
        }
        .padding(.top, Spacing.xs)
    }

    private var workingOverlay: some View {
        ZStack {
            Color.black.opacity(0.15).ignoresSafeArea()
            ProgressView()
                .padding(Spacing.lg)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
    }

    // MARK: Helpers

    private func toggleSave() {
        _ = app.togglePlaceSaved(result.place)
        Haptics.impact(.light)
    }

    private func openDirections(to place: Place) {
        guard let lat = place.latitude, let lng = place.longitude else { return }
        Haptics.selection()
        DirectionsLauncher.open(to: CLLocationCoordinate2D(latitude: lat, longitude: lng), name: place.name)
    }
}
