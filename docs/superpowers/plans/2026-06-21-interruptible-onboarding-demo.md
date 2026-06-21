# Interruptible Onboarding Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the completion-gated four-action practice with one optional, interruptible, self-demonstrating card and give the welcome screen a larger animated Dealy mark.

**Architecture:** A pure `PracticeDemoState` model defines the ordered teaching phases, interruption state, labels, and offsets. `OnboardingPracticeView` owns cancellable Swift concurrency tasks that advance that model while idle, while existing production gesture recognition continues to handle direct interaction. `OnboardingIntroView` receives a focused visual revision without changing navigation or location behavior.

**Tech Stack:** Swift 5, SwiftUI, XCTest, iOS 17+, structured concurrency, existing Dealy design system.

## Global Constraints

- Use one persistent practice card.
- Run the idle teaching sequence in 5.2 seconds.
- Restart from the first phase after 2.5 seconds of post-interaction idle time.
- Any touch or drag must interrupt automated card motion immediately.
- `Start exploring` must always be enabled.
- Reserve Helvetica Neue Condensed Black for `PASS`, `SAVE`, `USE DEAL`, and `DETAILS`.
- Respect Reduce Motion with stationary card phases.
- Do not change production Home swipe behavior or the location permission flow.

---

### Task 1: Pure demo state

**Files:**
- Modify: `Dealy/Models/PracticeTutorialState.swift`
- Modify: `DealyTests/PracticeTutorialStateTests.swift`

**Interfaces:**
- Consumes: `CGSize` from CoreGraphics.
- Produces: `PracticeDemoPhase`, `PracticeDemoState.phase`, `PracticeDemoState.isInterrupted`, `PracticeDemoState.advance()`, `interrupt()`, `resumeFromBeginning()`, and `offset(reduceMotion:)`.

- [ ] **Step 1: Write failing model tests**

Add tests asserting:

```swift
func testDemoPhasesAdvanceInTeachingOrderAndWrap() {
    var state = PracticeDemoState()
    XCTAssertEqual(state.phase, .details)
    state.advance()
    XCTAssertEqual(state.phase, .pass)
    state.advance()
    XCTAssertEqual(state.phase, .save)
    state.advance()
    XCTAssertEqual(state.phase, .useNow)
    state.advance()
    XCTAssertEqual(state.phase, .details)
}

func testInterruptionPausesAdvanceUntilResume() {
    var state = PracticeDemoState()
    state.interrupt()
    state.advance()
    XCTAssertEqual(state.phase, .details)
    state.resumeFromBeginning()
    XCTAssertFalse(state.isInterrupted)
    XCTAssertEqual(state.phase, .details)
}

func testDemoOffsetsMatchPhaseAndReduceMotionIsStationary() {
    XCTAssertEqual(PracticeDemoState(phase: .pass).offset(reduceMotion: false), CGSize(width: -42, height: 0))
    XCTAssertEqual(PracticeDemoState(phase: .save).offset(reduceMotion: false), CGSize(width: 42, height: 0))
    XCTAssertEqual(PracticeDemoState(phase: .useNow).offset(reduceMotion: false), CGSize(width: 0, height: -42))
    XCTAssertEqual(PracticeDemoState(phase: .details).offset(reduceMotion: false), .zero)
    XCTAssertEqual(PracticeDemoState(phase: .pass).offset(reduceMotion: true), .zero)
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath .derivedData-onboarding -only-testing:DealyTests/PracticeTutorialStateTests test
```

Expected: compile failure because `PracticeDemoState` and `PracticeDemoPhase` do not exist.

- [ ] **Step 3: Implement the pure model**

Add:

```swift
enum PracticeDemoPhase: CaseIterable, Equatable {
    case details, pass, save, useNow

    var next: Self {
        switch self {
        case .details: .pass
        case .pass: .save
        case .save: .useNow
        case .useNow: .details
        }
    }
}

struct PracticeDemoState: Equatable {
    private(set) var phase: PracticeDemoPhase
    private(set) var isInterrupted = false

    init(phase: PracticeDemoPhase = .details) {
        self.phase = phase
    }

    mutating func advance() {
        guard !isInterrupted else { return }
        phase = phase.next
    }

    mutating func interrupt() {
        isInterrupted = true
    }

    mutating func resumeFromBeginning() {
        isInterrupted = false
        phase = .details
    }

    func offset(reduceMotion: Bool) -> CGSize {
        guard !reduceMotion else { return .zero }
        switch phase {
        case .details: .zero
        case .pass: CGSize(width: -42, height: 0)
        case .save: CGSize(width: 42, height: 0)
        case .useNow: CGSize(width: 0, height: -42)
        }
    }
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command. Expected: all `PracticeTutorialStateTests` pass.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Models/PracticeTutorialState.swift DealyTests/PracticeTutorialStateTests.swift
git commit -m "test(ios): define interruptible practice demo state"
```

### Task 2: One-card interruptible preview

**Files:**
- Modify: `Dealy/Views/Onboarding/OnboardingPracticeView.swift`
- Modify: `DealyTests/PracticeTutorialStateTests.swift`

**Interfaces:**
- Consumes: `PracticeDemoState`, `DealSwipeGesture.intent`, existing practice detail and redemption sheets.
- Produces: one always-skippable practice card with a cancellable 5.2-second idle loop.

- [ ] **Step 1: Add a failing optional-completion test**

Add a pure presentation policy:

```swift
func testPracticePreviewIsAlwaysSkippable() {
    XCTAssertTrue(PracticeDemoPolicy.canContinue)
}
```

Run the focused Task 1 test command. Expected: compile failure because `PracticeDemoPolicy` does not exist.

- [ ] **Step 2: Add the minimal policy**

Add to the model file:

```swift
enum PracticeDemoPolicy {
    static let canContinue = true
}
```

Run the focused tests. Expected: pass.

- [ ] **Step 3: Replace completion gating with an idle demo**

In `OnboardingPracticeView`:

- replace `PracticeTutorialState` with `PracticeDemoState`;
- add `@State private var demoTask: Task<Void, Never>?`;
- derive automated offset from `demo.offset(reduceMotion:)`;
- use a 1.3-second phase duration for four phases, totaling 5.2 seconds;
- animate phase changes without automatically opening sheets;
- show only the current plain-text instruction;
- keep `Start exploring` enabled at all times;
- cancel the task in `.onDisappear`.

Use:

```swift
private func scheduleDemo(after delay: Duration = .zero) {
    demoTask?.cancel()
    demoTask = Task { @MainActor in
        try? await Task.sleep(for: delay)
        guard !Task.isCancelled else { return }
        demo.resumeFromBeginning()
        while !Task.isCancelled && !demo.isInterrupted {
            try? await Task.sleep(for: .milliseconds(1300))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.45)) {
                demo.advance()
            }
        }
    }
}
```

- [ ] **Step 4: Make touch interruption immediate**

At drag start and tap recognition:

```swift
private func interruptDemo() {
    demoTask?.cancel()
    demo.interrupt()
}
```

Use manual `dragOffset` while interrupted. After a manual action or reset, call:

```swift
scheduleDemo(after: .milliseconds(2500))
```

Left and right animate the same card out and restore it. Up and tap open their existing practice sheets. No manual action is required to continue.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath .derivedData-onboarding -only-testing:DealyTests/PracticeTutorialStateTests test
```

Then:

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath .derivedData-onboarding test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add Dealy/Views/Onboarding/OnboardingPracticeView.swift Dealy/Models/PracticeTutorialState.swift DealyTests/PracticeTutorialStateTests.swift
git commit -m "feat(ios): add interruptible one-card onboarding demo"
```

### Task 3: Distinctive animated welcome

**Files:**
- Modify: `Dealy/Views/Onboarding/OnboardingIntroView.swift`
- Modify: `README.md`

**Interfaces:**
- Consumes: `DealyMonochrome`, existing theme colors, Reduce Motion environment.
- Produces: large animated Dealy mark and rounded-system opening headline.

- [ ] **Step 1: Revise the intro composition**

Make the Dealy mark the primary visual:

```swift
Image("DealyMonochrome")
    .renderingMode(.template)
    .resizable()
    .scaledToFit()
    .frame(width: 132, height: 112)
    .scaleEffect(appear ? 1 : 0.72)
    .rotationEffect(.degrees(appear ? 0 : -7))
    .offset(x: logoDrift)
```

Use a single restrained repeating drift of roughly 10 points to hint at the card gesture. Disable the drift under Reduce Motion.

- [ ] **Step 2: Remove condensed typography from the welcome**

Use:

```swift
Text("Deals worth\nswiping for.")
    .font(.system(size: 52, weight: .black, design: .rounded))
```

Use standard system typography for the brand wordmark and all supporting text. Keep `.dealyCondensedBlack` only in the practice gesture labels.

- [ ] **Step 3: Update README wording**

Describe the practice step as an optional, interruptible one-card idle demo rather than a required four-action exercise.

- [ ] **Step 4: Build and visually verify**

Run:

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath .derivedData-onboarding build
```

Launch on the iPhone 17 Pro simulator and verify:

- the logo is the dominant welcome element;
- the intro headline is rounded, not condensed;
- only gesture labels use condensed Helvetica;
- the idle demo cycles through details, pass, save, and use-now;
- touching the card immediately interrupts motion;
- `Start exploring` is enabled before interaction;
- Reduce Motion keeps the card stationary.

- [ ] **Step 5: Commit**

```bash
git add Dealy/Views/Onboarding/OnboardingIntroView.swift README.md
git commit -m "style(ios): give onboarding a distinct Dealy welcome"
```

### Task 4: Final verification

**Files:**
- Verify all changed files.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: a clean, verified branch.

- [ ] **Step 1: Run the complete clean suite**

```bash
xcodebuild -project Dealy.xcodeproj -scheme Dealy -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath .derivedData-onboarding clean test
```

Expected: `TEST SUCCEEDED`, zero failures.

- [ ] **Step 2: Check repository hygiene**

```bash
git diff --check
git status --short
rg -n "4 of 4|moves learned|disabled\\(!tutorial.isComplete\\)|dealyCondensedBlack" Dealy/Views/Onboarding README.md
```

Expected: no completion-gated practice copy; condensed type appears only on swipe labels and practice-sheet action headings, not the welcome.

- [ ] **Step 3: Commit any final corrections**

```bash
git add Dealy DealyTests README.md
git commit -m "fix(ios): polish onboarding demo verification"
```

Only create this commit if final verification required corrections.
