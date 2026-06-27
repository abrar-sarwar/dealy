# Spec draft: Verified campus student-discount source acquisition (GSU, GT, KSU, UGA)

**Status:** draft / follow-up to PR #13 (campus/student lane mechanism shipped, awaiting real supply).

## Problem
The campus/student-discount lane is implemented and tested end to end (`campusSlug`,
`requiresStudentId`, extraction → promotion → DTO → iOS badge), but **there is no real
live campus supply**. A real `discovery:run gsu` against `dining.gsu.edu/specials/`
crawled (HTTP 200) but extracted **0 concrete student discounts** — campus dining pages
don't list structured offers. No campus deal is currently visible, and demo/mock rows
are explicitly disallowed.

## Goal
Find **real public pages that explicitly list current student discounts** near each of
GSU, GT, KSU, UGA; verify each manually; seed disabled; enable **only** sources that
produce real, extractable offers. **Do not fake deals. Do not seed invented campus rows.**

## Coverage required
One verified source per campus where possible: **GSU, GT, KSU, UGA**. If no real source
is found for a campus, **say so plainly** in the result — do not substitute mock data.

## Candidate source types (to research + verify, not assume)
- Student-newspaper articles that list local student discounts (KSU Sentinel, GSU Signal/
  Student Center, GT Nique, UGA Red & Black) — needs the specific **article URL**, not the homepage.
- Campus **bookstore coupon** pages (bncollege/bkstr per campus).
- **Student center / student life / student government** perk pages.
- Local **business student-discount** pages.
- Restaurant pages that explicitly say **"student discount"**.
- Student **ticketing / discounted attraction** pages.
- **Student Beans / UNiDAYS** merchant pages, if crawlable.

## Per-source verification checklist (all must pass before enabling)
1. Public URL (no login / paywall).
2. HTTP 200.
3. Content is **current** or at least not obviously expired.
4. Page **explicitly lists a discount/perk** (concrete offer text, not just "students welcome").
5. Merchant/location is **resolvable** (Google Places near the campus centroid) or has a
   real address on the page.
6. A trial `discovery:run <campus>` actually **extracts ≥1 concrete offer** (Gemini yield > 0).
7. Stored in `crawl_sources` with the correct `zoneSlug` (gsu/gt/ksu/uga), `kind:
   'student_discount'`, and **`enabled: false` until the operator verifies item 6**.

## Acceptance
- For each campus: either a verified source that yields ≥1 real extractable student deal
  (then it may be enabled), or a plain statement that none was found.
- A discovery run promotes ≥1 real campus deal that surfaces in `/v1/feeds/local` with
  `campusSlug` set and the iOS Student-ID / campus badge — **on real data only**.
- Source-coverage + extraction tests updated; no fixture/demo data in production feeds
  (guarded by `feed-isolation.e2e-spec.ts`).

## Out of scope
Inventing deals, enabling sources that don't yield, or shipping demo rows.
