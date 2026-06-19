import SwiftUI

enum AppearancePreference: String, CaseIterable, Identifiable {
    case dark
    case automatic
    case light

    static let storageKey = "com.dealy.appearance"
    static let defaultValue: AppearancePreference = .dark

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .dark: return "Dark"
        case .automatic: return "Automatic"
        case .light: return "Light"
        }
    }

    var symbol: String {
        switch self {
        case .dark: return "moon.fill"
        case .automatic: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .dark: return .dark
        case .automatic: return nil
        case .light: return .light
        }
    }
}
