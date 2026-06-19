# Swipe Tutorial Design

## Goal

Make Dealy's home deck teach and support three primary gestures:

- Swipe left to dismiss a deal with the label `BYE`.
- Swipe right to save a deal with the label `SAVE`.
- Swipe up to open the existing Get Deal flow with the label `GET DEAL`.

## Experience

The home screen removes its heart, watch, and share action buttons so the card is the primary control. A compact first-run coach overlay explains the three gestures and can be dismissed. It does not reappear after dismissal.

Tapping a card continues to open deal details. Undo remains available for left and right swipes. Swiping up opens Get Deal without removing the card from the deck or recording a swipe.

## Gesture Rules

Horizontal movement wins when its absolute distance is greater than vertical movement. Vertical movement triggers Get Deal only for a sufficiently strong upward drag. Incomplete and downward drags return the card to rest.

The card shows directional feedback while dragging: BYE on the right edge during a left drag, SAVE on the left edge during a right drag, and GET DEAL near the bottom during an upward drag.

## Boundaries

This change is frontend-only. It does not modify backend files, authentication, data models, persistence formats, or deal redemption infrastructure.

## Verification

Unit tests cover gesture classification and first-run tutorial persistence. The full iOS test target and a simulator build must pass.
