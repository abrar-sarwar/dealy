import CoreGraphics
import Foundation

/// Ordered controls the idle Home deck teaches itself: tap for details, then
/// pass, save, and use. Pure value type — no timers or SwiftUI.
enum SwipeDemoPhase: CaseIterable, Equatable {
    case details
    case pass
    case save
    case use

    var next: SwipeDemoPhase {
        switch self {
        case .details: .pass
        case .pass: .save
        case .save: .use
        case .use: .details
        }
    }

    /// Single-word action label rendered in condensed type over the card.
    var label: String {
        switch self {
        case .details: "DETAILS"
        case .pass: "PASS"
        case .save: "SAVE"
        case .use: "USE"
        }
    }

    /// Spoken description for VoiceOver (the visible label is one word).
    var accessibilityLabel: String {
        switch self {
        case .details: "Tap for details"
        case .pass: "Swipe left to pass"
        case .save: "Swipe right to save"
        case .use: "Swipe up to use the deal"
        }
    }
}

struct SwipeDemoState: Equatable {
    private(set) var phase: SwipeDemoPhase
    private(set) var isInterrupted = false

    init(phase: SwipeDemoPhase = .details) {
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
        case .use:
            return CGSize(width: 0, height: -42)
        }
    }
}

enum OnboardingStep: Int, CaseIterable, Equatable {
    case welcome
    case interests

    var next: OnboardingStep? {
        switch self {
        case .welcome: return .interests
        case .interests: return nil
        }
    }
}
