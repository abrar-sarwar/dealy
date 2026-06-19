import SwiftUI

struct SwipeTutorialView: View {
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var cue = 0

    var body: some View {
        ZStack {
            glow(color: Theme.skip, alignment: .leading)
                .opacity(cue == 0 ? 1 : 0.16)
            glow(color: Theme.save, alignment: .trailing)
                .opacity(cue == 1 ? 1 : 0.16)
            bottomGlow
                .opacity(cue == 2 ? 1 : 0.16)

            edgeLabel("Bye", symbol: "xmark", color: Theme.skip)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 10)
            edgeLabel("Save", symbol: "bookmark.fill", color: Theme.save)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.trailing, 10)
            edgeLabel("Get deal", symbol: "arrow.up", color: Theme.primary)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 18)

            VStack(spacing: 8) {
                Text("Swipe the card")
                    .font(.headline.weight(.bold))
                Text("Left to pass · right to save · up to get it")
                    .font(.caption)
                    .opacity(0.84)
                Button("Got it") { onDismiss() }
                    .font(.subheadline.weight(.bold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(.white, in: Capsule())
                    .foregroundStyle(.black)
            }
            .foregroundStyle(.white)
            .padding(14)
            .background(.black.opacity(0.58), in: RoundedRectangle(cornerRadius: 18))
            .padding(.top, 16)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .task {
            guard !reduceMotion else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1.15))
                withAnimation(.easeInOut(duration: 0.45)) {
                    cue = (cue + 1) % 3
                }
            }
        }
    }

    private func edgeLabel(_ text: String, symbol: String, color: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(color.opacity(0.9), in: Capsule())
    }

    private func glow(color: Color, alignment: Alignment) -> some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: alignment == .leading
                        ? [color, color.opacity(0)]
                        : [color.opacity(0), color],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(width: 82)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .blur(radius: 16)
    }

    private var bottomGlow: some View {
        LinearGradient(
            colors: [.clear, Theme.primary],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 94)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .blur(radius: 16)
    }
}
