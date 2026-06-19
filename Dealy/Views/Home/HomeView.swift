import SwiftUI

struct HomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var viewModel = HomeFeedViewModel()
    @State private var dragOffset: CGSize = .zero
    @State private var isSwiping = false
    @State private var selectedDeal: Deal?
    @State private var showLocation = false
    @State private var showNotifications = false

    private let swipeThreshold: CGFloat = 110

    var body: some View {
        VStack(spacing: Spacing.sm) {
            header
            CategoryFilterBar(selection: $viewModel.selectedCategory) {
                rebuild()
            }
            deckArea
            if viewModel.topDeal != nil {
                actionBar
            }
        }
        .padding(.top, Spacing.xs)
        .background(Theme.background.ignoresSafeArea())
        .onChange(of: app.loadState) { _, _ in rebuild() }
        .onChange(of: app.currentCampus.id) { _, _ in rebuild() }
        .onChange(of: app.radius) { _, _ in rebuild() }
        .onAppear { if viewModel.deck.isEmpty { rebuild() } }
        .sheet(item: $selectedDeal) { DealDetailView(deal: $0) }
        .sheet(isPresented: $showLocation) { LocationSelectorView() }
        .sheet(isPresented: $showNotifications) { NotificationsPlaceholderSheet() }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                Image("DealyMark")
                    .resizable().scaledToFit()
                    .frame(width: 30, height: 30)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text("Dealy")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                    .foregroundStyle(Theme.primaryText)
            }

            Spacer()

            Button { showLocation = true } label: {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.circle.fill")
                    Text(app.currentCampus.shortName).lineLimit(1)
                    Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.primary)
                .padding(.vertical, 7).padding(.horizontal, Spacing.sm)
                .background(Capsule().fill(Theme.primary.opacity(0.12)))
            }
            .accessibilityLabel("Change location, currently \(app.currentCampus.name)")

            Button { showNotifications = true } label: {
                Image(systemName: "bell.badge")
                    .font(.title3)
                    .foregroundStyle(Theme.primaryText)
                    .padding(8)
                    .background(Circle().fill(Theme.surface))
                    .overlay(Circle().stroke(Theme.separator, lineWidth: 0.75))
            }
            .accessibilityLabel("Notifications")
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: Deck

    private var deckArea: some View {
        ZStack {
            switch app.loadState {
            case .loading, .idle:
                LoadingDeckView()
            case .failed(let message):
                EmptyStateView(symbol: "wifi.exclamationmark",
                               title: "Couldn’t load deals",
                               message: message,
                               primaryTitle: "Try again",
                               primaryAction: { Task { await app.loadDeals() } })
            case .loaded:
                if viewModel.topDeal == nil {
                    emptyState
                } else {
                    cardStack
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, Spacing.lg)
    }

    private var cardStack: some View {
        ZStack {
            ForEach(Array(viewModel.visibleCards.enumerated()), id: \.element.id) { idx, deal in
                let isTop = idx == 0
                SwipeCardView(deal: deal,
                              campus: app.currentCampus,
                              dragTranslation: isTop ? dragOffset : .zero)
                    .scaleEffect(1 - CGFloat(idx) * 0.05)
                    .offset(y: CGFloat(idx) * 14)
                    .offset(isTop ? dragOffset : .zero)
                    .rotationEffect(.degrees(isTop ? Double(dragOffset.width) / 18 : 0))
                    .zIndex(Double(viewModel.visibleCards.count - idx))
                    .allowsHitTesting(isTop && !isSwiping)
                    .gesture(dragGesture(for: deal))   // only the top card hit-tests
                    .onTapGesture { if isTop { selectedDeal = deal } }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(deal.title) at \(deal.merchant). \(saveSkipHint)")
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: viewModel.deck.map(\.id))
    }

    private var saveSkipHint: String {
        "Double tap to open. Use the buttons below to save or skip."
    }

    private var emptyState: some View {
        let reason = viewModel.emptyReason(using: app)
        let message: String
        switch reason {
        case .allSwiped: message = "You’ve been through every deal here. Refresh to start a new pass."
        case .filteredOut: message = "No deals in this category right now. Try clearing the filter."
        case .noneInArea: message = "No deals match your area and radius yet. Try a wider radius or a new location."
        }
        return EmptyStateView(
            symbol: "sparkles",
            title: "Fresh deals coming soon",
            message: message,
            primaryTitle: "Refresh deals",
            primaryAction: { refresh() },
            secondaryTitle: viewModel.selectedCategory != nil ? "Clear filter" : nil,
            secondaryAction: viewModel.selectedCategory != nil ? {
                viewModel.selectedCategory = nil; rebuild()
            } : nil
        )
    }

    // MARK: Action bar

    private var actionBar: some View {
        VStack(spacing: Spacing.xs) {
            if app.lastSwipe != nil {
                Button { undo() } label: {
                    Label("Undo last swipe", systemImage: "arrow.uturn.backward")
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(GhostButtonStyle())
                .transition(.opacity.combined(with: .scale))
            }

            HStack(spacing: Spacing.lg) {
                circleButton(symbol: "xmark", tint: Theme.skip, size: 58,
                             label: "Skip deal") { performSwipe(.left) }
                circleButton(symbol: app.isWatched(currentID) ? "bell.fill" : "bell",
                             tint: Theme.watch, size: 48,
                             label: "Watch deal") { toggleWatch() }
                if let deal = viewModel.topDeal {
                    ShareLink(item: shareText(for: deal)) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Theme.primary)
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(Theme.primary.opacity(0.12)))
                    }
                    .accessibilityLabel("Share deal")
                }
                circleButton(symbol: "heart.fill", tint: Theme.save, size: 58,
                             label: "Save deal") { performSwipe(.right) }
            }
        }
        .padding(.bottom, Spacing.sm)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: app.lastSwipe?.id)
    }

    private var currentID: String { viewModel.topDeal?.id ?? "" }

    private func circleButton(symbol: String, tint: Color, size: CGFloat,
                              label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: size, height: size)
                .background(Circle().fill(Theme.surface))
                .overlay(Circle().stroke(tint.opacity(0.35), lineWidth: 1.5))
                .dealyShadow(.soft)
        }
        .buttonStyle(.plain)
        .disabled(isSwiping)
        .accessibilityLabel(label)
    }

    // MARK: Gesture & actions

    private func dragGesture(for deal: Deal) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                guard !isSwiping else { return }
                dragOffset = value.translation
            }
            .onEnded { value in
                guard !isSwiping else { return }
                let w = value.translation.width
                let predicted = value.predictedEndTranslation.width
                if w > swipeThreshold || predicted > 380 {
                    performSwipe(.right)
                } else if w < -swipeThreshold || predicted < -380 {
                    performSwipe(.left)
                } else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { dragOffset = .zero }
                }
            }
    }

    private func performSwipe(_ direction: SwipeDirection) {
        guard !isSwiping, let deal = viewModel.topDeal else { return }
        isSwiping = true
        Haptics.impact(direction.isSave ? .medium : .light)

        let commit = {
            app.recordSwipe(dealID: deal.id, direction: direction)
            viewModel.popTop()
            dragOffset = .zero
            isSwiping = false
        }

        if reduceMotion {
            commit()
            return
        }
        let endX: CGFloat = direction.isSave ? 750 : -750
        withAnimation(.easeIn(duration: 0.28)) {
            dragOffset = CGSize(width: endX, height: 60)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28, execute: commit)
    }

    private func undo() {
        guard let id = app.undoLastSwipe(), let deal = app.deal(id: id) else { return }
        Haptics.impact(.light)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            viewModel.reinsertTop(deal)
        }
    }

    private func toggleWatch() {
        guard let deal = viewModel.topDeal else { return }
        _ = app.toggleWatched(deal.id)
        Haptics.impact(.light)
    }

    private func shareText(for deal: Deal) -> String {
        var parts = ["Found this on Dealy: \(deal.title) at \(deal.merchant)"]
        if deal.savingsAmount > 0 {
            parts.append("Save \(Format.moneyWhole(deal.savingsAmount))")
        }
        return parts.joined(separator: " — ")
    }

    private func rebuild() {
        viewModel.rebuild(using: app)
    }

    private func refresh() {
        // Restore a fresh pass without destroying preferences/saved deals.
        app.resetDealHistory()
        rebuild()
    }
}

/// Skeleton shown while the mock service "loads".
struct LoadingDeckView: View {
    var body: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
                .fill(Theme.fieldBackground)
                .frame(height: 196)
            VStack(alignment: .leading, spacing: Spacing.sm) {
                RoundedRectangle(cornerRadius: 6).fill(Theme.fieldBackground).frame(height: 22).frame(maxWidth: 220)
                RoundedRectangle(cornerRadius: 6).fill(Theme.fieldBackground).frame(height: 16).frame(maxWidth: 120)
                RoundedRectangle(cornerRadius: 6).fill(Theme.fieldBackground).frame(height: 28).frame(maxWidth: 160)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
        }
        .dealyCardSurface(cornerRadius: Radius.xl)
        .redacted(reason: .placeholder)
        .accessibilityLabel("Loading deals")
    }
}

/// Notifications placeholder explaining backend-dependent alerts.
struct NotificationsPlaceholderSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.md) {
                Spacer()
                ZStack {
                    Circle().fill(Theme.brandGradient).frame(width: 84, height: 84)
                    Image(systemName: "bell.badge.fill").font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)
                }
                Text("Live alerts are coming")
                    .font(.title2.weight(.bold)).foregroundStyle(Theme.primaryText)
                Text("Once Dealy connects to its backend, you’ll get instant alerts when matching deals drop and when watched deals are about to expire.")
                    .font(.subheadline).foregroundStyle(Theme.mutedText)
                    .multilineTextAlignment(.center).padding(.horizontal, Spacing.lg)
                Spacer()
                Button("Got it") { dismiss() }
                    .buttonStyle(.primaryDealy).padding(.horizontal, Spacing.lg).padding(.bottom, Spacing.xl)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Notifications").navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}
