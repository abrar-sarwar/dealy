import SwiftUI

@main
struct DealyApp: App {
    @State private var appState: AppState
    @AppStorage(AppearancePreference.storageKey)
    private var appearanceRawValue = AppearancePreference.defaultValue.rawValue

    init() {
        // Debug/simulator builds default to the live local backend so the app shows
        // real discovered deals (opt into mock data with DEALY_API_ENV=mock). Release
        // builds stay on mock unless DEALY_API_ENV selects a live environment.
        let apiEnv = ProcessInfo.processInfo.environment["DEALY_API_ENV"]
        #if DEBUG
        let useRemote = apiEnv != "mock"
        #else
        let useRemote = apiEnv != nil
        #endif
        let service: DealServicing
        let placeFeed: PlaceFeedServicing
        let smartBasket: SmartBasketServicing
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
            placeFeed = composed.placeFeed
            smartBasket = composed.smartBasket
            recorder = composed.recorder
        } else {
            service = MockDealService()
            placeFeed = MockPlaceFeedService()
            smartBasket = MockSmartBasketService()
            recorder = NoopInteractionRecorder()
        }
        _appState = State(initialValue: AppState(
            dealService: service,
            placeFeedService: placeFeed,
            smartBasketService: smartBasket,
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
