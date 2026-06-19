import XCTest
import SwiftUI
@testable import Dealy

final class AppearancePreferenceTests: XCTestCase {
    func testDarkIsTheDefaultAppearance() {
        XCTAssertEqual(AppearancePreference.defaultValue, .dark)
    }

    func testAppearanceMapsToExpectedColorScheme() {
        XCTAssertEqual(AppearancePreference.dark.colorScheme, .dark)
        XCTAssertNil(AppearancePreference.automatic.colorScheme)
        XCTAssertEqual(AppearancePreference.light.colorScheme, .light)
    }
}
