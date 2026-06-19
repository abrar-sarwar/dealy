# Advanced Deal Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accurate recent/popular sorting, price range filtering, price presets, and high-value deal toggles to Home.

**Architecture:** Add `publishedAt` to the domain and API model. Keep all user-selected feed controls in a `DealFeedFilters` value, with pure filtering and sorting in `DealFilter` and `DealSortOption`; Home passes this value into the filter sheet and rebuilds its deck.

**Tech Stack:** SwiftUI, Foundation, XCTest, XcodeGen

## Global Constraints

- Most Recent uses `publishedAt`.
- Most Popular uses `dealScore`.
- Price range supports `$0...$500`.
- Recommended remains the default sort.
- Existing location and category filters remain available.

---

### Task 1: Domain and API date

**Files:** `Dealy/Models/Deal.swift`, `Dealy/Services/API/DealDTO.swift`, `Dealy/Data/MockDeals.swift`, `DealyTests/DealDTOMappingTests.swift`

- [ ] Add a failing DTO mapping assertion for `publishedAt`.
- [ ] Add the domain/DTO field and deterministic mock publication dates.
- [ ] Run mapping tests.

### Task 2: Pure filter and sort behavior

**Files:** `Dealy/Utilities/DealFeedFilters.swift`, `Dealy/Services/DealFilter.swift`, `DealyTests/DealFilterTests.swift`

- [ ] Test price range, online-only, ending-soon, strong-discount, popularity, recency, discount, and low-price ordering.
- [ ] Implement the minimal filtering and sorting behavior.
- [ ] Run focused tests.

### Task 3: Filter sheet and feed integration

**Files:** `Dealy/ViewModels/HomeFeedViewModel.swift`, `Dealy/Views/Home/HomeView.swift`, `Dealy/Views/Home/HomeFilterSheet.swift`

- [ ] Store `DealFeedFilters` in Home.
- [ ] Add sort chips, dual price sliders, presets, and toggles to the sheet.
- [ ] Rebuild the deck after applying controls.
- [ ] Build and visually inspect the simulator.
