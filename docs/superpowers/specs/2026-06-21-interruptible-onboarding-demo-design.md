# Interruptible Onboarding Demo Design

## Goal

Make first-run onboarding understandable without requiring a user to complete
four practice interactions. The practice card should teach itself while idle,
remain fully interactive, and feel visually specific to Dealy rather than a
sports-betting product.

## Flow

The onboarding remains:

1. Welcome
2. Interests
3. Swipe preview

Location permission is requested after the welcome action. There is no separate
location page, and denial continues in Anywhere.

## Welcome

The welcome screen centers Dealy's identity around a large animated brand mark.
The mark enters with a restrained scale-and-float motion, followed by a small
card-like lateral movement that hints at swiping.

The opening headline uses the existing friendly rounded system typography, not
Helvetica Neue Condensed Black. Supporting copy and controls remain quiet so the
animated mark is the screen's signature element. Reduce Motion shows the final
composition without continuous movement.

## Swipe Preview

The preview uses one persistent practice deal card. It does not require four
cards or four completed actions.

When the user leaves the screen untouched, a 5.2-second looping demonstration
teaches the controls:

1. Tap for details
2. Move left to pass
3. Move right to save
4. Move up to use the deal

Each phase moves the same card slightly, displays its matching plain-text label,
then returns the card to rest. The card is never automatically dismissed and
the demo does not open sheets by itself.

Helvetica Neue Condensed Black is reserved for the gesture labels: `PASS`,
`SAVE`, `USE DEAL`, and `DETAILS`. Other onboarding typography uses the app's
normal system styles.

## Interruption and Manual Control

Any touch or drag immediately pauses the automated demonstration and transfers
control to the user. Manual gestures continue to use the production swipe
thresholds:

- left: pass animation, then restore the practice card;
- right: save animation, then restore the practice card;
- up: present the practice redemption explanation;
- tap: present practice deal details.

After manual interaction ends and the screen remains idle for 2.5 seconds, the
demonstration restarts from the first phase. It must never fight an active
gesture.

The `Start exploring` button is always available. Completing every practice
action is optional.

## State and Components

`PracticeDemoState` owns the current demo phase, whether the demo is paused by
interaction, and the derived card offset. It contains no timers or SwiftUI
types beyond geometry values needed for presentation.

`OnboardingPracticeView` owns the cancellable asynchronous demo loop. Starting
a gesture cancels the current loop before applying the user's translation.
Ending interaction schedules a fresh idle loop.

`OnboardingIntroView` owns only its entrance animation and respects Reduce
Motion.

## Accessibility

- Gesture instructions have spoken equivalents and are not conveyed by motion
  or color alone.
- Reduce Motion replaces the moving demonstration with timed label changes and
  a stationary card.
- Manual interaction and the always-enabled continue button remain available.
- Dynamic Type may scale supporting text; display labels use minimum scaling to
  avoid clipping.

## Testing

Unit tests cover:

- the ordered demo phase sequence and wraparound;
- the offset associated with each phase;
- interruption pausing the demo;
- resuming from the first phase after idle;
- the preview being skippable without completed actions.

The complete iOS test suite and a simulator build must pass. Visual verification
must confirm the intro no longer uses condensed type for its headline and that
touching the card interrupts automated motion.

## Non-goals

- Voice narration
- Multiple practice cards
- Requiring tutorial completion
- Changing production Home swipe behavior
- Changing the location permission flow
