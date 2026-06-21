import CoreGraphics
import XCTest
@testable import Dealy

final class PracticeTutorialStateTests: XCTestCase {
    func testAllFourActionsAreRequiredToCompleteTutorial() {
        var state = PracticeTutorialState()

        XCTAssertFalse(state.isComplete)
        XCTAssertEqual(state.remainingActions, Set(PracticeTutorialAction.allCases))

        state.complete(.pass)
        state.complete(.save)
        state.complete(.useNow)

        XCTAssertFalse(state.isComplete)
        XCTAssertEqual(state.remainingActions, [.viewDetails])

        state.complete(.viewDetails)

        XCTAssertTrue(state.isComplete)
        XCTAssertTrue(state.remainingActions.isEmpty)
    }

    func testCompletingAnActionTwiceIsIdempotent() {
        var state = PracticeTutorialState()

        state.complete(.save)
        state.complete(.save)

        XCTAssertEqual(state.completedActions, [.save])
    }

    func testPracticeActionMapsFromExistingSwipeIntent() {
        XCTAssertEqual(PracticeTutorialAction(intent: .bye), .pass)
        XCTAssertEqual(PracticeTutorialAction(intent: .save), .save)
        XCTAssertEqual(PracticeTutorialAction(intent: .getDeal), .useNow)
        XCTAssertNil(PracticeTutorialAction(intent: .rest))
    }

    func testOnboardingSequenceIsWelcomeInterestsPractice() {
        XCTAssertEqual(OnboardingStep.allCases, [.welcome, .interests, .practice])
        XCTAssertEqual(OnboardingStep.welcome.next, .interests)
        XCTAssertEqual(OnboardingStep.interests.next, .practice)
        XCTAssertNil(OnboardingStep.practice.next)
    }
}
