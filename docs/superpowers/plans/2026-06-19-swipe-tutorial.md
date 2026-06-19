# Swipe Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home action icons with a first-run tutorial and three-direction card gestures.

**Architecture:** Put gesture classification in a small pure Swift type so thresholds and direction priority are unit-testable. Keep animation and presentation in `HomeView`, while `SwipeCardView` renders directional drag feedback and a focused tutorial overlay owns its own persisted dismissal state.

**Tech Stack:** Swift 5, SwiftUI, XCTest, UserDefaults

## Global Constraints

- Preserve all current uncommitted work.
- Do not modify anything under `backend/`.
- Left means BYE, right means SAVE, and up means GET DEAL.
- Upward Get Deal does not remove the card or record swipe history.
- Keep tap-to-open details and Undo.

---

### Task 1: Gesture Classification

**Files:**
- Create: `Dealy/Utilities/DealSwipeGesture.swift`
- Create: `DealyTests/DealSwipeGestureTests.swift`

**Interfaces:**
- Produces: `DealSwipeIntent`, `DealSwipeGesture.intent(translation:predictedEndTranslation:)`

- [ ] Write tests proving right, left, up, and incomplete/downward drags classify correctly.
- [ ] Run the focused tests and verify they fail because the classifier does not exist.
- [ ] Implement the smallest pure classifier that passes the tests.
- [ ] Run the focused tests and verify they pass.

### Task 2: Tutorial Persistence

**Files:**
- Create: `Dealy/Views/Home/SwipeTutorialView.swift`
- Create: `Dealy/Utilities/SwipeTutorialState.swift`
- Create: `DealyTests/SwipeTutorialStateTests.swift`

**Interfaces:**
- Produces: `SwipeTutorialState.hasSeenTutorial`, `markSeen()`

- [ ] Write tests proving tutorial dismissal persists.
- [ ] Run the focused tests and verify they fail.
- [ ] Implement injectable UserDefaults-backed tutorial state.
- [ ] Build the compact tutorial overlay with left, right, and up instructions.
- [ ] Run the focused tests and verify they pass.

### Task 3: Home Deck Integration

**Files:**
- Modify: `Dealy/Views/Home/HomeView.swift`
- Modify: `Dealy/Views/Home/SwipeCardView.swift`

**Interfaces:**
- Consumes: `DealSwipeGesture`, `DealSwipeIntent`, `SwipeTutorialView`

- [ ] Replace horizontal-only drag decisions with the tested three-direction classifier.
- [ ] Route up to the existing `GetDealSheet` without popping the card.
- [ ] Remove the heart, watch, share, and notification icon controls from Home.
- [ ] Keep Undo for committed left/right swipes.
- [ ] Render BYE, SAVE, and GET DEAL drag stamps.
- [ ] Present and persist the first-run tutorial.

### Task 4: Verification

**Files:**
- Modify only if verification reveals a scoped regression.

- [ ] Regenerate the Xcode project if required.
- [ ] Run the complete Dealy test target.
- [ ] Build the Dealy app for an available iOS simulator.
- [ ] Review `git diff` and confirm no backend file changed.
