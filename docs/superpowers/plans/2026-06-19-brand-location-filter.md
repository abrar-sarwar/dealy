# Brand and Location Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Dealy glyph to a rounded wordmark and combine campus, range, and category controls into the Home filter sheet.

**Architecture:** Keep Home responsible for presenting the sheet. Let `HomeFilterSheet` own draft campus/radius state and apply both through `AppState.selectCampus(_:radius:)` when Done is tapped. Category changes continue rebuilding the feed immediately.

**Tech Stack:** SwiftUI, Observation, XCTest, XcodeGen

## Global Constraints

- Preserve the full-screen editorial card layout.
- Use the existing `DealyGlyph` asset and system fonts only.
- Search radius remains constrained to `1...25` miles.
- Do not modify unrelated backend or map work.

---

### Task 1: Verify combined location updates

**Files:**
- Modify: `DealyTests/AppStateTests.swift`

- [ ] Add a test that calls `selectCampus(.georgiaTech, radius: 12)` and verifies both campus and radius.
- [ ] Run the focused test and confirm it passes against the existing state boundary.

### Task 2: Build the combined filter sheet

**Files:**
- Modify: `Dealy/Views/Home/HomeFilterSheet.swift`
- Modify: `Dealy/Views/Home/HomeView.swift`

- [ ] Replace the location navigation row with an inline campus picker.
- [ ] Add `RadiusControl` below the campus picker.
- [ ] Apply campus and radius when Done is tapped.
- [ ] Remove the separate location-sheet presentation path from Home.

### Task 3: Refine the brand lockup

**Files:**
- Modify: `Dealy/Views/Home/HomeView.swift`

- [ ] Place `DealyGlyph` beside the centered wordmark.
- [ ] Use a bold rounded system face with tight tracking to echo the glyph geometry.
- [ ] Build, install, launch, and inspect the simulator screenshot.
