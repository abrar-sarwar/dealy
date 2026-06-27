import Foundation

/// Single integration point for the authenticated Supabase access token used on
/// requests that require auth (interaction events). Implementations MUST return a
/// *current, valid* token — refreshing as needed — never a token captured at
/// startup. Returns nil when the user is signed out (public feeds still work).
protocol AuthTokenProviding: Sendable {
    func currentAccessToken() async -> String?
}

/// Shipping default until the Supabase iOS session layer exists.
///
/// ⚠️ PRODUCTION WIRING DEPENDENCY: there is currently no Supabase
/// authentication/session layer in the iOS app (no sign-in, no token store), so
/// this always returns nil. Consequences (by design — the server is NOT weakened):
///   • Public feeds work (they need no token).
///   • Interaction events are best-effort: with no token the server returns 401
///     and the event is silently dropped — UI is never blocked.
/// To enable ACCEPTED interaction delivery, replace this with a provider backed by
/// the Supabase session that returns the current access token and auto-refreshes.
struct NoSessionTokenProvider: AuthTokenProviding {
    func currentAccessToken() async -> String? { nil }
}

/// Builds the shared authenticated API client plus the services that ride on it,
/// so feed requests and interaction events use ONE client + token provider. Feeds
/// work with or without a token; the recorder attaches `Authorization: Bearer`
/// whenever the provider yields a current token.
enum RemoteComposition {
    static func make(
        baseURL: URL,
        auth: AuthTokenProviding,
        session: URLSession = .shared
    ) -> (service: DealServicing, placeFeed: PlaceFeedServicing,
          smartBasket: SmartBasketServicing, recorder: DealInteractionRecording) {
        let client = APIClient(
            baseURL: baseURL,
            session: session,
            tokenProvider: { await auth.currentAccessToken() }
        )
        // One RemoteDealService backs both the deal feeds and the place feed (it
        // conforms to DealServicing + PlaceFeedServicing over the same client).
        let remote = RemoteDealService(client: client)
        // Smart Basket rides the same authenticated client (public endpoints).
        let smartBasket = RemoteSmartBasketService(client: client)
        return (remote, remote, smartBasket, RemoteInteractionRecorder(client: client))
    }
}
