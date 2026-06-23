import SwiftUI

struct HomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var viewModel = HomeFeedViewModel()
    @State private var dragOffset: CGSize = .zero
    @State private var isSwiping = false
    @State private var selectedDeal: Deal?
    @State private var getDeal: Deal?
    @State private var showFilters = false
    @AppStorage(SwipeTutorialState.key) private var hasSeenSwipeTutorial = false

    // First-run self-demo that runs on the real top card until the user acts.
    @State private var demo = SwipeDemoState()
    @State private var demoTask: Task<Void, Never>?
    @State private var demoNudge: CGSize = .zero

    private var isDemoRunning: Bool {
        !hasSeenSwipeTutorial && !demo.isInterrupted
    }

    /// The top card follows the idle demo's gentle nudge until any interaction
    /// hands control back to the user's real drag.
    private var topCardOffset: CGSize {
        isDemoRunning ? demoNudge : dragOffset
    }

    var body: some View {
        VStack(spacing: 10) {
            header
            deckArea
        }
        .padding(.top, 4)
        .background(Theme.background.ignoresSafeArea())
        .onChange(of: app.loadState) { _, _ in rebuild() }
        .onChange(of: app.discovery) { _, _ in rebuild() }
        .onAppear { if viewModel.deck.isEmpty { rebuild() } }
        .onDisappear { demoTask?.cancel() }
        .sheet(item: $selectedDeal) { DealDetailView(deal: $0) }
        .sheet(item: $getDeal) { GetDealSheet(deal: $0) }
        .sheet(isPresented: $showFilters) {
            HomeFilterSheet(
                selectedCategory: $viewModel.selectedCategory,
                filters: $viewModel.filters,
                onChange: rebuild
            )
        }
    }

    // MARK: Header

    private var header: some View {
        ZStack {
            HStack(spacing: 2) {
                Image("DealyMonochrome")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 46, height: 38)
                    .foregroundStyle(Theme.primaryText)

                Text("Dealy")
                    .font(.system(size: 31, weight: .semibold, design: .serif))
                    .tracking(-0.8)
                    .foregroundStyle(Theme.primaryText)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Dealy")

            HStack {
                Button { undo() } label: {
                    Image(systemName: "arrow.uturn.backward")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 42, height: 42)
                        .background(Theme.surface, in: Circle())
                        .overlay(Circle().stroke(Theme.separator, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.primaryText)
                .disabled(app.lastSwipe == nil)
                .opacity(app.lastSwipe == nil ? 0.32 : 1)
                .accessibilityLabel("Undo last swipe")

                Spacer()

                Button { showFilters = true } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 42, height: 42)
                        .background(Theme.surface, in: Circle())
                        .overlay(Circle().stroke(Theme.separator, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.primaryText)
                .accessibilityLabel("Open location, category, and deal filters")
            }
        }
        .padding(.horizontal, 14)
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
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }

    private var cardStack: some View {
        ZStack {
            ForEach(Array(viewModel.visibleCards.enumerated()), id: \.element.id) { idx, deal in
                let isTop = idx == 0
                // Show one card; the next sits directly behind it (no peeking
                // stack) and is revealed only as the top card is swiped away.
                SwipeCardView(deal: deal,
                              campus: app.currentCampus,
                              // Suppress the card's own SAVE/SKIP stamps during the
                              // idle demo so only the single-word label teaches.
                              dragTranslation: (isTop && !isDemoRunning) ? dragOffset : .zero)
                    .offset(isTop ? topCardOffset : .zero)
                    .rotationEffect(.degrees(isTop ? Double(topCardOffset.width) / 18 : 0))
                    .zIndex(Double(viewModel.visibleCards.count - idx))
                    .allowsHitTesting(isTop && !isSwiping)
                    .gesture(dragGesture(for: deal))   // only the top card hit-tests
                    // Card-display boundary: the top card is "shown" to the user.
                    .onAppear {
                        if isTop {
                            app.recordImpression(deal.id)
                            startDemoIfNeeded()
                        }
                    }
                    .onTapGesture {
                        if isTop {
                            interruptDemo()
                            app.recordOpened(deal.id)
                            selectedDeal = deal
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(deal.title) at \(deal.merchant). \(saveSkipHint)")
            }

            if isDemoRunning, viewModel.topDeal != nil {
                SwipeDemoLabel(phase: demo.phase)
                    .zIndex(100)
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: viewModel.deck.map(\.id))
    }

    private var saveSkipHint: String {
        "Swipe left to say bye, right to save, or up to get the deal."
    }

    @ViewBuilder
    private var emptyState: some View {
        let reason = viewModel.emptyReason(using: app)
        switch reason {
        case _ where app.discovery.mode == .nearby && app.nearbyCoverage?.qualified == false:
            // Server says this area isn't part of the live pilot yet — be honest
            // and offer Anywhere. Never expose internal rollout-zone terminology.
            EmptyStateView(
                symbol: "mappin.slash",
                title: "Dealy isn’t live here yet",
                message: "We’re verifying enough nearby deals to launch your area. In the meantime, browse great online deals from Anywhere.",
                primaryTitle: "Browse online",
                primaryAction: { browseOnline() },
                secondaryTitle: "Try again",
                secondaryAction: { refresh() }
            )
        case .noneInArea where app.discovery.mode == .nearby && app.locationAuthorization != .authorizedWhenInUse:
            // Nearby needs location access — explain calmly and offer to enable it.
            EmptyStateView(
                symbol: "location.slash",
                title: "Nearby needs your location",
                message: "Turn on location to see verified deals around you, or browse online deals from Anywhere.",
                primaryTitle: "Enable Nearby deals",
                primaryAction: { enableNearby() },
                secondaryTitle: "Browse online",
                secondaryAction: { browseOnline() }
            )
        case .noneInArea where app.discovery.mode == .nearby:
            // Offer explicit choices instead of silently widening the search.
            EmptyStateView(
                symbol: "location.magnifyingglass",
                title: "No deals in range",
                message: "Nothing nearby at \(app.discovery.radiusMiles) mi. Widen your range or browse online deals from anywhere.",
                primaryTitle: "Browse online",
                primaryAction: { browseOnline() },
                secondaryTitle: app.discovery.radiusMiles < DiscoveryPreference.maxRadius ? "Widen range" : nil,
                secondaryAction: app.discovery.radiusMiles < DiscoveryPreference.maxRadius ? { widenRange() } : nil
            )
        default:
            EmptyStateView(
                symbol: "sparkles",
                title: "Fresh deals coming soon",
                message: defaultEmptyMessage(for: reason),
                primaryTitle: "Refresh deals",
                primaryAction: { refresh() },
                secondaryTitle: viewModel.selectedCategory != nil ? "Clear filter" : nil,
                secondaryAction: viewModel.selectedCategory != nil ? {
                    viewModel.selectedCategory = nil; rebuild()
                } : nil
            )
        }
    }

    private func defaultEmptyMessage(for reason: HomeFeedViewModel.EmptyReason) -> String {
        switch reason {
        case .allSwiped: return "You’ve been through every deal here. Refresh to start a new pass."
        case .filteredOut: return "No deals in this category right now. Try clearing the filter."
        case .noneInArea: return "No online deals to show right now. Refresh to try again."
        }
    }

    private func browseOnline() {
        Task { await app.applyDiscovery(app.discovery.switching(to: .anywhere)) }
    }

    private func enableNearby() {
        Task { await app.switchToNearby() }
    }

    private func widenRange() {
        let widened = min(app.discovery.radiusMiles * 2, DiscoveryPreference.maxRadius)
        Task {
            await app.applyDiscovery(.nearby(center: app.discovery.center, radiusMiles: widened))
        }
    }

    // MARK: Gesture & actions

    private func dragGesture(for deal: Deal) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                guard !isSwiping else { return }
                interruptDemo()
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
        app.recordRedemptionClicked(deal.id)
        resetCard()
        getDeal = deal
    }

    private func resetCard() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
            dragOffset = .zero
        }
    }

    // MARK: First-run swipe demo

    /// Loop the four controls on the real top card while idle: nudge slightly,
    /// hold, settle back to rest, advance. ~1.3s per phase, ~5s a cycle. Never
    /// dismisses the card or opens a sheet on its own.
    private func startDemoIfNeeded() {
        guard isDemoRunning, demoTask == nil else { return }
        demoTask = Task { @MainActor in
            demoNudge = .zero
            demo.resumeFromBeginning()

            while !Task.isCancelled && !demo.isInterrupted {
                let target = reduceMotion ? .zero : demo.offset(reduceMotion: reduceMotion)

                withAnimation(.easeInOut(duration: reduceMotion ? 0 : 0.4)) {
                    demoNudge = target
                }
                try? await Task.sleep(for: .milliseconds(650))
                guard !Task.isCancelled && !demo.isInterrupted else { return }

                withAnimation(.easeInOut(duration: reduceMotion ? 0 : 0.4)) {
                    demoNudge = .zero
                }
                try? await Task.sleep(for: .milliseconds(650))
                guard !Task.isCancelled && !demo.isInterrupted else { return }

                demo.advance()
            }
        }
    }

    /// Any touch hands control back immediately and retires the demo for good.
    private func interruptDemo() {
        guard isDemoRunning else { return }
        demoTask?.cancel()
        demo.interrupt()
        demoNudge = .zero
        hasSeenSwipeTutorial = true
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
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(Theme.fieldBackground)
            VStack(alignment: .leading, spacing: Spacing.sm) {
                RoundedRectangle(cornerRadius: 6).fill(Theme.fieldBackground).frame(height: 22).frame(maxWidth: 220)
                RoundedRectangle(cornerRadius: 6).fill(Theme.fieldBackground).frame(height: 16).frame(maxWidth: 120)
                RoundedRectangle(cornerRadius: 6).fill(Theme.fieldBackground).frame(height: 28).frame(maxWidth: 160)
            }
            .padding(Spacing.lg)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
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
