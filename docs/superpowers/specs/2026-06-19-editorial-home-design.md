# Editorial Home Redesign

## Goal

Rebuild Dealy's Home screen as a minimal, image-led swipe experience inspired by the supplied fashion-card reference while preserving Dealy's identity and deal-focused information.

## Layout

The top bar contains a small undo control on the left, a centered `Dealy` wordmark, and a filter control on the right. The existing horizontal category strip and deck counter are removed.

The active deal fills most of the screen inside one restrained rounded rectangle. Deal artwork occupies the full card. A dark bottom fade supports the deal title, merchant, and price. A slim floating metadata bar sits above that copy and shows distance, category, and expiration in one line.

The next cards remain subtly visible through scale and vertical offset, but borders and heavy shadows are reduced.

## Filters

The filter control opens a compact sheet containing the existing category choices plus location and distance access. Changing a category rebuilds the deck. Location opens the existing location selector.

## Gesture Coaching

The existing modal tutorial is replaced with a lightweight coach overlay on the card. It does not draw arrows or point at controls.

- The left edge glows coral and says `Bye`.
- The right edge glows green and says `Save`.
- The bottom edge glows blue and says `Get deal`.

The glows pulse one at a time and the user dismisses the coach with a small `Got it` control. During actual dragging, the relevant edge glow intensifies. Large stamped labels are removed.

## Visual Direction

- Canvas: cool near-white.
- Card: full-bleed image, quiet radius, minimal frame.
- Wordmark: centered serif, restrained and editorial.
- Utility text: system sans serif.
- Accent color: Dealy blue, used sparingly.
- Signature: the floating glass metadata rail over the image.

## Behavior

Swipe left, right, and up retain their current behavior. Tapping opens detail. Undo remains available. Empty, loading, and failure states continue to work.

## Scope

This is a frontend-only Home redesign. Backend files, deal data, persistence formats, tab navigation, Explore, Saved, and detail behavior are unchanged.
