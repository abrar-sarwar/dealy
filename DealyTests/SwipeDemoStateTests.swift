import CoreGraphics
import XCTest
@testable import Dealy

final class SwipeDemoStateTests: XCTestCase {
    func testOnboardingSequenceIsWelcomeThenInterests() {
        XCTAssertEqual(OnboardingStep.allCases, [.welcome, .interests])
        XCTAssertEqual(OnboardingStep.welcome.next, .interests)
        XCTAssertNil(OnboardingStep.interests.next)
    }

    func testDemoPhasesAdvanceInTeachingOrderAndWrap() {
        var state = SwipeDemoState()

        XCTAssertEqual(state.phase, .details)
        state.advance()
        XCTAssertEqual(state.phase, .pass)
        state.advance()
        XCTAssertEqual(state.phase, .save)
        state.advance()
        XCTAssertEqual(state.phase, .use)
        state.advance()
        XCTAssertEqual(state.phase, .details)
    }

    func testInterruptionPausesAdvanceUntilResume() {
        var state = SwipeDemoState()

        state.interrupt()
        state.advance()

        XCTAssertEqual(state.phase, .details)
        XCTAssertTrue(state.isInterrupted)

        state.resumeFromBeginning()

        XCTAssertFalse(state.isInterrupted)
        XCTAssertEqual(state.phase, .details)
    }

    func testResumeRewindsToFirstPhaseEvenAfterAdvancing() {
        var state = SwipeDemoState(phase: .save)

        state.interrupt()
        state.resumeFromBeginning()

        XCTAssertEqual(state.phase, .details)
        XCTAssertFalse(state.isInterrupted)
    }

    func testDemoOffsetsMatchPhaseAndReduceMotionIsStationary() {
        XCTAssertEqual(
            SwipeDemoState(phase: .pass).offset(reduceMotion: false),
            CGSize(width: -42, height: 0)
        )
        XCTAssertEqual(
            SwipeDemoState(phase: .save).offset(reduceMotion: false),
            CGSize(width: 42, height: 0)
        )
        XCTAssertEqual(
            SwipeDemoState(phase: .use).offset(reduceMotion: false),
            CGSize(width: 0, height: -42)
        )
        XCTAssertEqual(
            SwipeDemoState(phase: .details).offset(reduceMotion: false),
            .zero
        )
        XCTAssertEqual(
            SwipeDemoState(phase: .pass).offset(reduceMotion: true),
            .zero
        )
    }

    func testDemoLabelsAreSingleWords() {
        XCTAssertEqual(SwipeDemoPhase.details.label, "DETAILS")
        XCTAssertEqual(SwipeDemoPhase.pass.label, "PASS")
        XCTAssertEqual(SwipeDemoPhase.save.label, "SAVE")
        XCTAssertEqual(SwipeDemoPhase.use.label, "USE")
    }
}
