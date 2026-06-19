import SwiftUI
import MapKit

/// Full deal detail, presented as a sheet. Reads/writes shared state through
/// AppState so saved/watched/used stay consistent everywhere.
struct DealDetailView: View {
    let deal: Deal
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var showGetDeal = false
    @State private var showScoreInfo = false
    @State private var showUsedConfirm = false
    @State private var didMarkUsed = false

    private var isSaved: Bool { app.isSaved(deal.id) }
    private var isWatched: Bool { app.isWatched(deal.id) }
    private var isUsed: Bool { app.hasBeenUsed(deal.id) }

    private var reasons: [MatchReason] {
        DealRanker.reasons(for: deal, interests: app.interests, campus: app.currentCampus)
    }

    private var shareText: String {
        var parts = ["Check out this deal on Dealy: \(deal.title) at \(deal.merchant)"]
        if deal.savingsAmount > 0 {
            parts.append("Save \(Format.moneyWhole(deal.savingsAmount)) (\(deal.savingsPercentage)% off)")
        }
        if let code = deal.couponCode { parts.append("Code: \(code)") }
        return parts.joined(separator: " — ")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    hero
                    header
                    priceBlock
                    chipsRow
                    scoreCard
                    section("About this deal", deal.detailedDescription)
                    whyGood
                    if !deal.isOnline { mapSnippet }
                    section("Redemption & terms", deal.terms)
                    Color.clear.frame(height: 96) // room for the sticky action bar
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.md)
            }
            .background(Theme.background.ignoresSafeArea())
            .scrollIndicators(.hidden)
            .safeAreaInset(edge: .bottom) { actionBar }
            .navigationTitle("Deal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: shareText) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share deal")
                }
            }
        }
        .sheet(isPresented: $showGetDeal) { GetDealSheet(deal: deal) }
        .alert("Score explained", isPresented: $showScoreInfo) {
            Button("Got it", role: .cancel) {}
        } message: {
            Text("Deal Score blends discount strength, proximity to \(app.currentCampus.shortName), how soon it ends, and how well it matches your interests. It's a transparent local estimate — not a hidden algorithm.")
        }
    }

    // MARK: Sections

    private var hero: some View {
        CategoryArtwork(category: deal.category, seed: deal.visualSeed, symbolScale: 1.1)
            .frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
            .overlay(alignment: .topLeading) {
                InfoChip(symbol: deal.category.symbol, text: deal.category.displayName,
                         tint: .white, filled: false)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(Spacing.sm)
            }
            .overlay(alignment: .bottomLeading) {
                InfoChip(symbol: deal.isOnline ? "globe" : "mappin.circle.fill",
                         text: deal.isOnline ? "Online" : deal.primaryLocationTag,
                         tint: .white, filled: false)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(Spacing.sm)
            }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(deal.title)
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.primaryText)
            Text(deal.merchant)
                .font(.headline)
                .foregroundStyle(Theme.mutedText)
        }
    }

    private var priceBlock: some View {
        HStack(alignment: .center) {
            PriceView(deal: deal, size: .large)
            Spacer()
            SavingsPill(deal: deal)
        }
    }

    private var chipsRow: some View {
        FlexibleWrap(spacing: Spacing.xs, lineSpacing: Spacing.xs) {
            InfoChip(symbol: deal.isOnline ? "globe" : "location.fill",
                     text: Format.distance(deal.distanceMiles, isOnline: deal.isOnline),
                     tint: Theme.primary)
            ExpiryChip(date: deal.expirationDate)
            if isUsed {
                InfoChip(symbol: "checkmark.seal.fill", text: "Used", tint: Theme.save, filled: true)
            }
        }
    }

    private var scoreCard: some View {
        Button { showScoreInfo = true } label: {
            HStack(spacing: Spacing.sm) {
                DealScoreBadge(score: deal.dealScore)
                Text("Why you're seeing this")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                Spacer()
                Image(systemName: "info.circle").foregroundStyle(Theme.mutedText)
            }
            .padding(Spacing.md)
            .dealyCardSurface()
        }
        .buttonStyle(.plain)
    }

    private var whyGood: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Why this is a good deal")
                .font(.headline)
                .foregroundStyle(Theme.primaryText)
            ForEach(reasons) { reason in
                HStack(spacing: Spacing.sm) {
                    Image(systemName: reason.symbol)
                        .foregroundStyle(Theme.primary)
                        .frame(width: 22)
                    Text(reason.text)
                        .font(.subheadline)
                        .foregroundStyle(Theme.primaryText)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .dealyCardSurface()
    }

    private var mapSnippet: some View {
        let coord = DealGeo.coordinate(for: deal, around: app.currentCampus)
        return VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Location").font(.headline).foregroundStyle(Theme.primaryText)
            Map(initialPosition: .region(MKCoordinateRegion(
                center: coord,
                span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)))) {
                Annotation(deal.merchant, coordinate: coord) {
                    ZStack {
                        Circle().fill(deal.category.gradient)
                            .frame(width: 38, height: 38)
                            .overlay(Circle().stroke(.white, lineWidth: 2.5))
                            .dealyShadow(.soft)
                        Image(systemName: deal.category.symbol)
                            .font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                    }
                }
                .annotationTitles(.hidden)
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .frame(height: 150)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .stroke(Theme.separator, lineWidth: 0.75))
            .allowsHitTesting(false)
            .overlay(alignment: .bottomLeading) {
                Text("\(Format.distance(deal.distanceMiles, isOnline: false)) from \(app.currentCampus.shortName) · approximate")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                    .padding(.vertical, 5).padding(.horizontal, Spacing.xs)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(Spacing.xs)
            }
        }
    }

    private func section(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title).font(.headline).foregroundStyle(Theme.primaryText)
            Text(body).font(.subheadline).foregroundStyle(Theme.mutedText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Sticky action bar

    private var actionBar: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                toggleButton(active: isSaved, onSymbol: "heart.fill", offSymbol: "heart",
                             label: isSaved ? "Saved" : "Save", tint: Theme.save) {
                    let nowSaved = app.toggleSaved(deal.id)
                    Haptics.impact(.light)
                    _ = nowSaved
                }
                .accessibilityLabel(isSaved ? "Saved. Tap to remove" : "Save deal")

                toggleButton(active: isWatched, onSymbol: "bell.fill", offSymbol: "bell",
                             label: isWatched ? "Watching" : "Watch", tint: Theme.watch) {
                    _ = app.toggleWatched(deal.id)
                    Haptics.impact(.light)
                }
                .accessibilityLabel(isWatched ? "Watching. Tap to stop" : "Watch deal")
            }

            Button {
                showGetDeal = true
                Haptics.impact()
            } label: {
                Label("Get Deal", systemImage: "arrow.up.right.square.fill")
            }
            .buttonStyle(.primaryDealy)

            if deal.savingsAmount > 0 {
                Button {
                    if app.markUsed(deal) {
                        didMarkUsed = true
                        Haptics.notify(.success)
                    }
                    showUsedConfirm = true
                } label: {
                    Label(isUsed ? "Already counted in your savings" : "Mark as used",
                          systemImage: isUsed ? "checkmark.seal.fill" : "checkmark.circle")
                }
                .buttonStyle(GhostButtonStyle(fullWidth: true))
                .disabled(isUsed)
                .alert(didMarkUsed ? "Nice — saved!" : "Already counted",
                       isPresented: $showUsedConfirm) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text(didMarkUsed
                         ? "We added \(Format.moneyWhole(deal.savingsAmount)) to your tracked savings."
                         : "This deal is already in your tracked savings, so we didn't count it twice.")
                }
            }
        }
        .padding(Spacing.md)
        .background(.bar)
    }

    private func toggleButton(active: Bool, onSymbol: String, offSymbol: String,
                              label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: active ? onSymbol : offSymbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(active ? .white : tint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .fill(active ? AnyShapeStyle(tint) : AnyShapeStyle(tint.opacity(0.12)))
                )
        }
        .buttonStyle(.plain)
    }
}

/// "Get Deal" explainer sheet — frontend preview of redemption.
struct GetDealSheet: View {
    let deal: Deal
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var revealedCode = false

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.lg) {
                ZStack {
                    Circle().fill(Theme.brandGradient).frame(width: 84, height: 84)
                    Image(systemName: "arrow.up.right.square.fill")
                        .font(.system(size: 36, weight: .bold)).foregroundStyle(.white)
                }
                .padding(.top, Spacing.xl)

                Text(app.redemptionHandler.redemptionTitle(for: deal))
                    .font(.title2.weight(.bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.primaryText)

                Text("Backend coming soon. This will open the merchant link, coupon, map, or affiliate page.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.mutedText)
                    .padding(.horizontal, Spacing.lg)

                if let code = deal.couponCode {
                    VStack(spacing: Spacing.xs) {
                        Text("Coupon code").font(.caption).foregroundStyle(Theme.mutedText)
                        Text(revealedCode ? code : "••••••")
                            .font(.system(.title2, design: .monospaced, weight: .bold))
                            .foregroundStyle(Theme.primary)
                            .onTapGesture { withAnimation { revealedCode = true } }
                    }
                    .padding(Spacing.md)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .fill(Theme.primary.opacity(0.10)))
                    .padding(.horizontal, Spacing.lg)
                    if !revealedCode {
                        Text("Tap to reveal").font(.caption2).foregroundStyle(Theme.faintText)
                    }
                }

                Spacer()

                Button("Done") { dismiss() }
                    .buttonStyle(.primaryDealy)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.xl)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Get Deal")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}
