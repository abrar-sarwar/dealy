import CoreGraphics
import Foundation

enum PracticeDemoPhase: CaseIterable, Equatable {
    case details
    case pass
    case save
    case useNow

    var next: PracticeDemoPhase {
        switch self {
        case .details: .pass
        case .pass: .save
        case .save: .useNow
        case .useNow: .details
        }
    }

    var label: String {
        switch self {
        case .details: "DETAILS"
        case .pass: "← PASS"
        case .save: "SAVE →"
        case .useNow: "↑ USE DEAL"
        }
    }

    var instruction: String {
        switch self {
        case .details: "Tap for the full offer"
        case .pass: "Swipe left when it’s not for you"
        case .save: "Swipe right to keep it"
        case .useNow: "Swipe up when you’re ready"
        }
    }
}

struct PracticeDemoState: Equatable {
    private(set) var phase: PracticeDemoPhase
    private(set) var isInterrupted = false

    init(phase: PracticeDemoPhase = .details) {
        self.phase = phase
    }

    mutating func advance() {
        guard !isInterrupted else { return }
        phase = phase.next
    }

    mutating func interrupt() {
        isInterrupted = true
    }

    mutating func resumeFromBeginning() {
        isInterrupted = false
        phase = .details
    }

    func offset(reduceMotion: Bool) -> CGSize {
        guard !reduceMotion else { return .zero }
        switch phase {
        case .details:
            return .zero
        case .pass:
            return CGSize(width: -42, height: 0)
        case .save:
            return CGSize(width: 42, height: 0)
        case .useNow:
            return CGSize(width: 0, height: -42)
        }
    }
}

enum PracticeDemoPolicy {
    static let canContinue = true
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
