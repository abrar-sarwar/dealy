import CoreGraphics
import XCTest
@testable import Dealy

final class PracticeTutorialStateTests: XCTestCase {
    func testOnboardingSequenceIsWelcomeInterestsPractice() {
        XCTAssertEqual(OnboardingStep.allCases, [.welcome, .interests, .practice])
        XCTAssertEqual(OnboardingStep.welcome.next, .interests)
        XCTAssertEqual(OnboardingStep.interests.next, .practice)
        XCTAssertNil(OnboardingStep.practice.next)
    }

    func testDemoPhasesAdvanceInTeachingOrderAndWrap() {
        var state = PracticeDemoState()

        XCTAssertEqual(state.phase, .details)
        state.advance()
        XCTAssertEqual(state.phase, .pass)
        state.advance()
        XCTAssertEqual(state.phase, .save)
        state.advance()
        XCTAssertEqual(state.phase, .useNow)
        state.advance()
        XCTAssertEqual(state.phase, .details)
    }

    func testInterruptionPausesAdvanceUntilResume() {
        var state = PracticeDemoState()

        state.interrupt()
        state.advance()

        XCTAssertEqual(state.phase, .details)
        XCTAssertTrue(state.isInterrupted)

        state.resumeFromBeginning()

        XCTAssertFalse(state.isInterrupted)
        XCTAssertEqual(state.phase, .details)
    }

    func testResumeRewindsToFirstPhaseEvenAfterAdvancing() {
        var state = PracticeDemoState(phase: .save)

        state.interrupt()
        state.resumeFromBeginning()

        XCTAssertEqual(state.phase, .details)
        XCTAssertFalse(state.isInterrupted)
    }

    func testDemoOffsetsMatchPhaseAndReduceMotionIsStationary() {
        XCTAssertEqual(
            PracticeDemoState(phase: .pass).offset(reduceMotion: false),
            CGSize(width: -42, height: 0)
        )
        XCTAssertEqual(
            PracticeDemoState(phase: .save).offset(reduceMotion: false),
            CGSize(width: 42, height: 0)
        )
        XCTAssertEqual(
            PracticeDemoState(phase: .useNow).offset(reduceMotion: false),
            CGSize(width: 0, height: -42)
        )
        XCTAssertEqual(
            PracticeDemoState(phase: .details).offset(reduceMotion: false),
            .zero
        )
        XCTAssertEqual(
            PracticeDemoState(phase: .pass).offset(reduceMotion: true),
            .zero
        )
    }

    func testPracticePreviewIsAlwaysSkippable() {
        XCTAssertTrue(PracticeDemoPolicy.canContinue)
    }

    func testDemoPhaseProvidesPlainTextTeachingCopy() {
        XCTAssertEqual(PracticeDemoPhase.details.label, "DETAILS")
        XCTAssertEqual(PracticeDemoPhase.pass.label, "← PASS")
        XCTAssertEqual(PracticeDemoPhase.save.label, "SAVE →")
        XCTAssertEqual(PracticeDemoPhase.useNow.label, "↑ USE DEAL")
        XCTAssertEqual(PracticeDemoPhase.details.instruction, "Tap for the full offer")
    }
}
