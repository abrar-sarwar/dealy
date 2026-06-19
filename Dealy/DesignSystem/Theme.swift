import SwiftUI

/// Central design tokens for Dealy. Brand blues are fixed; surfaces and text
/// adapt for light/dark so dark mode works without per-view branching.
enum Theme {

    // MARK: Brand palette (fixed)
    static let primary = Color(hex: 0x2563EB)   // Primary blue
    static let bright = Color(hex: 0x3B82F6)    // Bright blue
    static let deep = Color(hex: 0x1D4ED8)      // Deep blue

    // MARK: Semantic, adaptive
    static let background = Color(uiColor: .dynamic(light: 0xF8FAFC, dark: 0x0B1120))
    static let surface = Color(uiColor: .dynamic(light: 0xFFFFFF, dark: 0x161E2E))
    static let surfaceElevated = Color(uiColor: .dynamic(light: 0xFFFFFF, dark: 0x1E293B))
    static let groupedBackground = Color(uiColor: .dynamic(light: 0xF1F5F9, dark: 0x0B1120))
    static let primaryText = Color(uiColor: .dynamic(light: 0x0F172A, dark: 0xF1F5F9))
    static let mutedText = Color(uiColor: .dynamic(light: 0x64748B, dark: 0x94A3B8))
    static let faintText = Color(uiColor: .dynamic(light: 0x94A3B8, dark: 0x64748B))
    static let separator = Color(uiColor: .dynamic(light: 0xE2E8F0, dark: 0x24304A))
    static let fieldBackground = Color(uiColor: .dynamic(light: 0xF1F5F9, dark: 0x1E293B))

    // MARK: Accents
    static let save = Color(hex: 0x16A34A)      // Positive / save (green)
    static let saveSoft = Color(hex: 0x22C55E)
    static let skip = Color(hex: 0xF43F5E)      // Skip / destructive (coral)
    static let watch = Color(hex: 0xF59E0B)     // Watch (amber)
    static let warning = Color(hex: 0xEA580C)   // Ending-soon urgency

    // MARK: Gradients
    static var brandGradient: LinearGradient {
        LinearGradient(
            colors: [deep, primary, bright],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static var brandGradientVertical: LinearGradient {
        LinearGradient(colors: [bright, deep], startPoint: .top, endPoint: .bottom)
    }
}

/// Spacing scale (4pt base).
enum Spacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 20
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    static let xxxl: CGFloat = 44
}

/// Continuous corner radii.
enum Radius {
    static let sm: CGFloat = 10
    static let md: CGFloat = 14
    static let lg: CGFloat = 20
    static let xl: CGFloat = 28
    static let pill: CGFloat = 999
}

struct Shadow {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat

    static let card = Shadow(color: .black.opacity(0.08), radius: 16, x: 0, y: 8)
    static let soft = Shadow(color: .black.opacity(0.06), radius: 10, x: 0, y: 4)
    static let floating = Shadow(color: .black.opacity(0.18), radius: 28, x: 0, y: 16)
}

extension View {
    func dealyShadow(_ shadow: Shadow) -> some View {
        self.shadow(color: shadow.color, radius: shadow.radius, x: shadow.x, y: shadow.y)
    }
}
