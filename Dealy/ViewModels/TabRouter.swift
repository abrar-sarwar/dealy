import Foundation
import Observation

enum AppTab: Int, Hashable {
    case home, explore, saved, plus, profile
}

/// Lightweight router so screens can request a tab switch (e.g. Saved → Home)
/// without faking a tab bar.
@Observable
final class TabRouter {
    var selection: AppTab = .home
}
