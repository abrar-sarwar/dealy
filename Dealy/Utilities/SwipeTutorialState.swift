import Foundation

enum SwipeTutorialState {
    static let key = "hasSeenHomeSwipeTutorial"

    static func hasSeen(in defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }

    static func markSeen(in defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: key)
    }

    static func markSeenAfterInteractiveOnboarding(in defaults: UserDefaults = .standard) {
        markSeen(in: defaults)
    }
}
