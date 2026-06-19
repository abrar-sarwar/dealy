# Editorial Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current chip-heavy Home deck with a minimal full-bleed editorial deal card, compact filters, and edge-light gesture coaching.

**Architecture:** Keep gesture and deck state in `HomeView`, move compact display formatting into a pure helper, and give filter and tutorial presentation focused SwiftUI views. Reuse current deal models, filtering, location selection, and swipe actions.

**Tech Stack:** Swift 5, SwiftUI, XCTest, UserDefaults

## Global Constraints

- Preserve swipe left, swipe right, swipe up, tap, and Undo behavior.
- Do not change backend files or persistence formats.
- Remove the category strip, deck counter, large drag stamps, and modal tutorial.
- Keep all existing loading, failure, and empty-state behavior.
- Respect Reduce Motion.

---

### Task 1: Compact Metadata

**Files:**
- Create: `Dealy/Utilities/DealCardMetadata.swift`
- Create: `DealyTests/DealCardMetadataTests.swift`

**Interfaces:**
- Produces: `DealCardMetadata.items(for:) -> [String]`

- [ ] Write tests for local and online deal metadata.
- [ ] Run focused tests and confirm they fail because the helper is absent.
- [ ] Implement category, distance, and expiration metadata with empty-value removal.
- [ ] Run focused tests and confirm they pass.

### Task 2: Filter Sheet

**Files:**
- Create: `Dealy/Views/Home/HomeFilterSheet.swift`
- Modify: `Dealy/Views/Home/HomeView.swift`

**Interfaces:**
- Consumes: `Binding<DealCategory?>`, current campus, radius.
- Produces: category changes, clear-filter action, and location-sheet action.

- [ ] Add a single top-right filter control.
- [ ] Implement the compact filter sheet using current category values.
- [ ] Route location configuration to the existing selector.
- [ ] Remove the old horizontal category strip.

### Task 3: Editorial Deal Card

**Files:**
- Modify: `Dealy/Views/Home/SwipeCardView.swift`
- Modify: `Dealy/Views/Home/HomeView.swift`

**Interfaces:**
- Consumes: `DealCardMetadata.items(for:)`, `dragTranslation`.

- [ ] Convert the card to a full-bleed image surface.
- [ ] Add bottom gradient, title, merchant, price, and savings copy.
- [ ] Add the floating metadata rail.
- [ ] Reduce stack offsets, border weight, and outer padding.
- [ ] Remove deck counter and large stamps.

### Task 4: Edge-Light Coach

**Files:**
- Modify: `Dealy/Views/Home/SwipeTutorialView.swift`
- Modify: `Dealy/Views/Home/SwipeCardView.swift`
- Modify: `Dealy/Views/Home/HomeView.swift`

**Interfaces:**
- Consumes: tutorial persistence and live drag direction.

- [ ] Replace the modal tutorial with card-edge lighting.
- [ ] Pulse left, right, and bottom cues sequentially.
- [ ] Intensify the corresponding edge during a live drag.
- [ ] Persist dismissal through the existing tutorial key.

### Task 5: Verification

**Files:**
- Modify only when a scoped defect is discovered.

- [ ] Regenerate the Xcode project.
- [ ] Build the app and complete test bundle.
- [ ] Install a fully ad-hoc-signed build in the `Dealy iPhone` simulator.
- [ ] Capture screenshots of Home and the filter sheet.
- [ ] Confirm no backend file changed.
