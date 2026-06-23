import Foundation

enum SwipeTutorialState {
    static let key = "hasSeenHomeSwipeTutorial"

    static func hasSeen(in defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }

    static func markSeen(in defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: key)
    }

    /// Re-arm the in-deck demo. Completing onboarding calls this so the live
    /// Home deck always teaches the swipe on first entry, even if the flag was
    /// left set by an earlier build.
    static func reset(in defaults: UserDefaults = .standard) {
        defaults.set(false, forKey: key)
    }
}
