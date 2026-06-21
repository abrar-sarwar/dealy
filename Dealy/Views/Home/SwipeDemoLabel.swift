import SwiftUI

/// Single-word, plain-text action label the idle deck shows while it
/// auto-demonstrates a swipe. Reserved condensed type; no bubbles or pills.
struct SwipeDemoLabel: View {
    let phase: SwipeDemoPhase

    var body: some View {
        Text(phase.label)
            .font(.dealyCondensedBlack(size: 34))
            .tracking(-0.5)
            .minimumScaleFactor(0.7)
            .foregroundStyle(color)
            .shadow(color: .black.opacity(0.55), radius: 10, y: 3)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .padding(insets)
            .animation(.easeInOut(duration: 0.3), value: phase)
            .accessibilityElement()
            .accessibilityLabel(phase.accessibilityLabel)
    }

    private var color: Color {
        switch phase {
        case .details: .white
        case .pass: Theme.skip
        case .save: Theme.save
        case .use: Theme.primary
        }
    }

    private var alignment: Alignment {
        switch phase {
        case .details: .bottom
        case .pass: .leading
        case .save: .trailing
        case .use: .top
        }
    }

    private var insets: EdgeInsets {
        switch phase {
        case .details: EdgeInsets(top: 0, leading: 0, bottom: 22, trailing: 0)
        case .pass: EdgeInsets(top: 0, leading: 14, bottom: 0, trailing: 0)
        case .save: EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 14)
        case .use: EdgeInsets(top: 18, leading: 0, bottom: 0, trailing: 0)
        }
    }
}
