import XCTest
@testable import Dealy

final class DealSwipeGestureTests: XCTestCase {
    func testStrongRightDragSaves() {
        XCTAssertEqual(
            DealSwipeGesture.intent(
                translation: .init(width: 125, height: 20),
                predictedEndTranslation: .init(width: 180, height: 30)
            ),
            .save
        )
    }

    func testStrongLeftDragSaysBye() {
        XCTAssertEqual(
            DealSwipeGesture.intent(
                translation: .init(width: -125, height: 20),
                predictedEndTranslation: .init(width: -180, height: 30)
            ),
            .bye
        )
    }

    func testStrongUpwardDragGetsDeal() {
        XCTAssertEqual(
            DealSwipeGesture.intent(
                translation: .init(width: 18, height: -100),
                predictedEndTranslation: .init(width: 24, height: -180)
            ),
            .getDeal
        )
    }

    func testHorizontalDirectionWinsForDiagonalDrag() {
        XCTAssertEqual(
            DealSwipeGesture.intent(
                translation: .init(width: 130, height: -95),
                predictedEndTranslation: .init(width: 190, height: -140)
            ),
            .save
        )
    }

    func testShortAndDownwardDragsReturnToRest() {
        XCTAssertEqual(
            DealSwipeGesture.intent(
                translation: .init(width: 40, height: -35),
                predictedEndTranslation: .init(width: 70, height: -60)
            ),
            .rest
        )
        XCTAssertEqual(
            DealSwipeGesture.intent(
                translation: .init(width: 5, height: 150),
                predictedEndTranslation: .init(width: 8, height: 220)
            ),
            .rest
        )
    }
}
