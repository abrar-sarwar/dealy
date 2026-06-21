import Foundation

enum PracticeTutorialAction: String, CaseIterable, Hashable {
    case pass
    case save
    case useNow
    case viewDetails

    init?(intent: DealSwipeIntent) {
        switch intent {
        case .bye: self = .pass
        case .save: self = .save
        case .getDeal: self = .useNow
        case .rest: return nil
        }
    }
}

struct PracticeTutorialState: Equatable {
    private(set) var completedActions: Set<PracticeTutorialAction> = []

    var remainingActions: Set<PracticeTutorialAction> {
        Set(PracticeTutorialAction.allCases).subtracting(completedActions)
    }

    var isComplete: Bool { remainingActions.isEmpty }

    mutating func complete(_ action: PracticeTutorialAction) {
        completedActions.insert(action)
    }
}

enum OnboardingStep: Int, CaseIterable, Equatable {
    case welcome
    case interests
    case practice

    var next: OnboardingStep? {
        switch self {
        case .welcome: return .interests
        case .interests: return .practice
        case .practice: return nil
        }
    }
}
