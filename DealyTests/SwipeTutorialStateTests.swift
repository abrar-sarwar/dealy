import XCTest
@testable import Dealy

final class SwipeTutorialStateTests: XCTestCase {
    func testTutorialStartsUnseenAndPersistsDismissal() throws {
        let suiteName = "SwipeTutorialStateTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertFalse(SwipeTutorialState.hasSeen(in: defaults))

        SwipeTutorialState.markSeen(in: defaults)

        XCTAssertTrue(SwipeTutorialState.hasSeen(in: defaults))
    }
}
