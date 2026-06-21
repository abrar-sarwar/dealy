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
        let service: DealServicing
        let recorder: DealInteractionRecording
        if useRemote {
            // Share one API client so the feed and interaction events use the same
            // base URL + auth token provider.
            let client = APIClient(baseURL: APIConfig.baseURL)
            service = RemoteDealService(client: client)
            recorder = RemoteInteractionRecorder(client: client)
        } else {
            service = MockDealService()
            recorder = NoopInteractionRecorder()
        }
        _appState = State(initialValue: AppState(
            dealService: service,
            locationProvider: CoreLocationProvider(),
            interactionRecorder: recorder
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
