# Modern Interactive Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current multi-page/location onboarding with a concise modern flow that requests location automatically and teaches Dealy through a real interactive practice card.

**Architecture:** `OnboardingFlow` becomes a three-stage coordinator: welcome, interests, and practice. Location acquisition runs automatically and falls back to Anywhere without blocking. A focused `PracticeTutorialState` owns completion of pass, save, use-now, and detail actions, while `OnboardingPracticeView` renders the gesture-driven card and real detail/use-now teaching surfaces.

**Tech Stack:** SwiftUI, Observation, Core Location abstraction, XCTest, XcodeGen, iOS 17.

## Global Constraints

- Use `HelveticaNeue-CondensedBlack` only for prominent display headlines and gesture verbs.
- Do not show a standalone “Where are you?” page.
- Request device location automatically; denial or failure continues in Anywhere.
- Teach swipe left to pass, swipe right to save, swipe up to use now, and tap to view details.
- Gesture guidance must be plain floating text, never pills, capsules, or speech bubbles.
- Location and radius remain editable later through the Home filter.
- Respect Reduce Motion and accessibility labels.

---

### Task 1: Practice Tutorial State

**Files:**
- Create: `Dealy/Models/PracticeTutorialState.swift`
- Create: `DealyTests/PracticeTutorialStateTests.swift`

**Interfaces:**
- Produces: `PracticeTutorialAction`, `PracticeTutorialState.complete(_:)`, `isComplete`, and `remainingActions`.

- [ ] Write tests proving each action completes independently, duplicate actions are idempotent, and all four actions are required.
- [ ] Run the focused tests and confirm they fail because the types do not exist.
- [ ] Implement the minimal value types.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Automatic Location Bootstrap

**Files:**
- Modify: `Dealy/ViewModels/AppState.swift`
- Modify: `DealyTests/AppStateTests.swift`
- Modify: `Dealy/Views/Onboarding/OnboardingFlow.swift`

**Interfaces:**
- Produces: `AppState.prepareDiscoveryForOnboarding() async`, which attempts device location once and falls back to Anywhere.

- [ ] Write tests for successful location → Nearby and failure → Anywhere.
- [ ] Run the focused tests and confirm the new API is missing.
- [ ] Implement the minimal AppState API by reusing `enableNearbyOrFallbackToAnywhere()`.
- [ ] Trigger it once from onboarding without blocking navigation.
- [ ] Run focused tests and confirm they pass.

### Task 3: Modern Welcome and Flow Simplification

**Files:**
- Modify: `Dealy/Views/Onboarding/OnboardingFlow.swift`
- Replace: `Dealy/Views/Onboarding/OnboardingIntroView.swift`
- Modify: `Dealy/Views/Onboarding/OnboardingInterestsView.swift`
- Create: `Dealy/DesignSystem/DisplayTypography.swift`

**Interfaces:**
- Produces: `Font.dealyCondensedBlack(size:)` and a three-stage onboarding flow.

- [ ] Add a testable step model proving the flow is welcome → interests → practice.
- [ ] Verify the test fails against the old six-stage flow.
- [ ] Add the condensed Helvetica display helper and implement the new welcome screen.
- [ ] Remove location and confirmation from the active coordinator.
- [ ] Run focused tests.

### Task 4: Interactive Practice Card

**Files:**
- Create: `Dealy/Views/Onboarding/OnboardingPracticeView.swift`
- Create: `Dealy/Views/Onboarding/PracticeDealDetailView.swift`
- Modify: `Dealy/Views/Onboarding/OnboardingFlow.swift`
- Modify: `DealyTests/PracticeTutorialStateTests.swift`

**Interfaces:**
- Consumes: `PracticeTutorialState`.
- Produces: practice drag/tap interactions and completion callback.

- [ ] Add failing tests for drag-intent-to-practice-action mapping.
- [ ] Implement the practice card using the existing `DealSwipeGesture.intent`.
- [ ] Reset the card after pass/save; show a lightweight use-now teaching surface after swipe up.
- [ ] Present a detail sheet after tap and mark detail learned.
- [ ] Render floating plain-text guidance and remove each instruction after completion.
- [ ] Enable “Start exploring” only after all four actions.
- [ ] Run focused tests.

### Task 5: Completion and Redundant Tutorial Removal

**Files:**
- Modify: `Dealy/Views/Onboarding/OnboardingFlow.swift`
- Modify: `Dealy/Views/Home/HomeView.swift`
- Modify: `Dealy/Utilities/SwipeTutorialState.swift`
- Modify: `DealyTests/SwipeTutorialStateTests.swift`

**Interfaces:**
- On completion: persist interests, mark onboarding complete, and mark the Home swipe tutorial seen.

- [ ] Add a failing test proving onboarding completion suppresses the Home tutorial.
- [ ] Implement a single completion helper.
- [ ] Remove the overlay from Home for newly onboarded users while preserving compatibility for existing installations that have not seen it.
- [ ] Run focused tests.

### Task 6: Verification and Visual QA

**Files:**
- Modify only if verification exposes defects.

- [ ] Run `xcodegen generate`.
- [ ] Run the full simulator test suite.
- [ ] Run a simulator build.
- [ ] Launch/reset onboarding and visually inspect welcome, interests, all four practice actions, detail sheet, use-now teaching state, automatic location fallback, and Home transition.
- [ ] Run `git diff --check`.
- [ ] Review the final diff for unrelated changes.
- [ ] Commit the implementation in focused commits.
