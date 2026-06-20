import SwiftUI

@main
struct DealyApp: App {
    @State private var appState: AppState
    @AppStorage(AppearancePreference.storageKey)
    private var appearanceRawValue = AppearancePreference.defaultValue.rawValue

    init() {
        // Use the live API only when DEALY_API_ENV is set (local/staging/production);
        // otherwise mock data powers previews and offline/local development.
        let useRemote = ProcessInfo.processInfo.environment["DEALY_API_ENV"] != nil
        let service: DealServicing = useRemote ? RemoteDealService() : MockDealService()
        _appState = State(initialValue: AppState(
            dealService: service,
            locationProvider: CoreLocationProvider()
        ))
    }

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
