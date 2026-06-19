# Monochrome Brand and Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the improvised header icon with the approved transparent Dealy mark and add Dark, Automatic, and Light appearance preferences with Dark as the default.

**Architecture:** Store appearance as a small `AppearancePreference` enum backed by `AppStorage`. Apply its optional `ColorScheme` at the app root, and expose the same persisted value through a Profile picker. Render the generated transparent logo as a template so it automatically uses adaptive foreground color.

**Tech Stack:** SwiftUI, AppStorage, XCTest, XcodeGen, PNG template asset

## Global Constraints

- Keep the “Dealy” wordmark visible beside the mark.
- The mark contains only the price tag, script D, tag hole, and three dashes.
- The mark renders black in light mode and white in dark mode.
- New installs default to Dark.
- Automatic follows the iPhone appearance.

---

### Task 1: Appearance preference model

**Files:**
- Create: `Dealy/Utilities/AppearancePreference.swift`
- Create: `DealyTests/AppearancePreferenceTests.swift`

- [ ] Write tests for Dark default and color-scheme mapping.
- [ ] Run the tests and confirm they fail because the type is absent.
- [ ] Implement the enum and mapping.
- [ ] Run the tests and confirm they pass.

### Task 2: Apply and edit appearance

**Files:**
- Modify: `Dealy/App/DealyApp.swift`
- Modify: `Dealy/Views/Profile/ProfileView.swift`

- [ ] Read the stored enum at the app root and apply `preferredColorScheme`.
- [ ] Add an Appearance picker under Profile preferences.
- [ ] Keep Dark selected when no value has been stored.

### Task 3: Install the adaptive logo

**Files:**
- Create: `Dealy/Assets.xcassets/DealyMonochrome.imageset/DealyMonochrome.png`
- Create: `Dealy/Assets.xcassets/DealyMonochrome.imageset/Contents.json`
- Modify: `Dealy/Views/Home/HomeView.swift`

- [ ] Replace the SF Symbol tag with the transparent template asset.
- [ ] Keep the black/white adaptive “Dealy” wordmark beside it.
- [ ] Build and inspect both Dark and Light simulator renders.
