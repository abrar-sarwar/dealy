import SwiftUI

struct HomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var viewModel = HomeFeedViewModel()
    @State private var dragOffset: CGSize = .zero
    @State private var isSwiping = false
    @State private var selectedDeal: Deal?
    @State private var getDeal: Deal?
    @State private var showLocation = false
    @State private var saveBurst = 0
    @AppStorage(SwipeTutorialState.key) private var hasSeenSwipeTutorial = false

    var body: some View {
        VStack(spacing: Spacing.sm) {
            header
            CategoryFilterBar(selection: $viewModel.selectedCategory) {
                rebuild()
            }
            if viewModel.topDeal != nil { deckCounter }
            deckArea
            if viewModel.topDeal != nil, app.lastSwipe != nil {
                actionBar
            }
        }
        .padding(.top, Spacing.xs)
        .background(Theme.background.ignoresSafeArea())
        .overlay { SaveBurstView(trigger: saveBurst).allowsHitTesting(false) }
        .onChange(of: app.loadState) { _, _ in rebuild() }
        .onChange(of: app.currentCampus.id) { _, _ in rebuild() }
        .onChange(of: app.radius) { _, _ in rebuild() }
        .onAppear { if viewModel.deck.isEmpty { rebuild() } }
        .sheet(item: $selectedDeal) { DealDetailView(deal: $0) }
        .sheet(item: $getDeal) { GetDealSheet(deal: $0) }
        .sheet(isPresented: $showLocation) { LocationSelectorView() }
        .overlay {
            if !hasSeenSwipeTutorial, viewModel.topDeal != nil {
                SwipeTutorialView {
                    hasSeenSwipeTutorial = true
                }
                .transition(.opacity)
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Theme.brandGradient)
                    .frame(width: 34, height: 34)
                    .overlay(
                        Image("DealyGlyph")
                            .resizable().scaledToFit()
                            .padding(7)
                    )
                    .dealyShadow(.soft)
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

        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: Deck

    /// Slim row above the deck: how many deals remain + an interaction hint.
    private var deckCounter: some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: "rectangle.stack.fill")
                .font(.caption2.weight(.bold))
                .foregroundStyle(Theme.primary)
            Text("\(viewModel.deck.count) deal\(viewModel.deck.count == 1 ? "" : "s") nearby")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.mutedText)
            Spacer()
            Label("Left · Right · Up", systemImage: "hand.draw")
                .font(.caption2.weight(.medium))
                .foregroundStyle(Theme.faintText)
                .labelStyle(.titleAndIcon)
        }
        .padding(.horizontal, Spacing.lg)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(viewModel.deck.count) deals nearby")
    }

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
                    .offset(y: CGFloat(idx) * 26)
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
        "Swipe left to say bye, right to save, or up to get the deal."
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
        Button { undo() } label: {
            Label("Undo last swipe", systemImage: "arrow.uturn.backward")
                .font(.footnote.weight(.semibold))
        }
        .buttonStyle(GhostButtonStyle())
        .transition(.opacity.combined(with: .scale))
        .padding(.bottom, Spacing.sm)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: app.lastSwipe?.id)
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
                switch DealSwipeGesture.intent(
                    translation: value.translation,
                    predictedEndTranslation: value.predictedEndTranslation
                ) {
                case .save:
                    performSwipe(.right)
                case .bye:
                    performSwipe(.left)
                case .getDeal:
                    openGetDeal(deal)
                case .rest:
                    resetCard()
                }
            }
    }

    private func openGetDeal(_ deal: Deal) {
        Haptics.impact(.medium)
        resetCard()
        getDeal = deal
    }

    private func resetCard() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
            dragOffset = .zero
        }
    }

    private func performSwipe(_ direction: SwipeDirection) {
        guard !isSwiping, let deal = viewModel.topDeal else { return }
        isSwiping = true
        Haptics.impact(direction.isSave ? .medium : .light)
        if direction.isSave { saveBurst += 1 }

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

    private func rebuild() {
        viewModel.rebuild(using: app)
    }

    private func refresh() {
        // Restore a fresh pass without destroying preferences/saved deals.
        app.resetDealHistory()
        rebuild()
    }
}

/// A celebratory heart that pops and fades each time `trigger` increments.
struct SaveBurstView: View {
    let trigger: Int
    @State private var phase: CGFloat = 1   // 1 == settled/invisible

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: 132, weight: .bold))
            .foregroundStyle(Theme.save)
            .scaleEffect(0.5 + phase * 0.85)
            .opacity(Double(1 - phase) * 0.92)
            .opacity(trigger == 0 ? 0 : 1)   // hidden until the first save
            .onChange(of: trigger) { _, _ in
                phase = 0
                withAnimation(.easeOut(duration: 0.55)) { phase = 1 }
            }
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
