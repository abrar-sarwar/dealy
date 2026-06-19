import SwiftUI

@main
struct DealyApp: App {
    @State private var appState = AppState()
    @AppStorage(AppearancePreference.storageKey)
    private var appearanceRawValue = AppearancePreference.defaultValue.rawValue

    private var appearance: AppearancePreference {
        AppearancePreference(rawValue: appearanceRawValue) ?? .defaultValue
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .tint(Theme.primary)
                .preferredColorScheme(appearance.colorScheme)
        }
    }
}
