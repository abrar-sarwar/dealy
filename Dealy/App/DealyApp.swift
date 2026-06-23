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
            // Feeds + interaction events share one authenticated client. The token
            // provider is the single Supabase-session integration point; until that
            // session layer exists it yields nil (public feeds work; authenticated
            // events are best-effort). See NoSessionTokenProvider.
            let composed = RemoteComposition.make(
                baseURL: APIConfig.baseURL,
                auth: NoSessionTokenProvider()
            )
            service = composed.service
            recorder = composed.recorder
        } else {
            service = MockDealService()
            recorder = NoopInteractionRecorder()
        }
        _appState = State(initialValue: AppState(
            dealService: service,
            locationProvider: CoreLocationProvider(),
            interactionRecorder: recorder,
            nearbyStores: MapKitNearbyStoresService()
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
