# iOS Integration

The SwiftUI app integrates via `Dealy/Services/API/` (all new, additive — the
mock services are retained for previews/tests/offline).

## What's wired (built + unit-tested)
- `APIConfig` — environment switch (`DEALY_API_ENV` = local/staging/production; default `https://api.dealy.app`) + `DealQuery`.
- `APIClient` — async URLSession, bearer-token hook (for Supabase), ISO-8601 (fractional) date decoding, typed `APIError`.
- `DealDTO` — Codable, separate from the domain `Deal`; `toDeal()` maps it (unknown category → `.food`). Mirrors the backend `DealDto` (incl. `publishedAt`).
- `RemoteDealService` — conforms to the existing `DealServicing`; drop-in for `MockDealService` via `AppState(dealService: RemoteDealService())`. Calls `GET /v1/feeds/nearby`.

Verified: iOS BUILD SUCCEEDED with the app's UI; `DealDTOMappingTests` pass.

## Still to wire (next iOS pass — needs a deployed API + Supabase)
- **Auth:** Supabase Auth SDK (email / Sign in with Apple / Google) → access token → `APIClient.tokenProvider`. Until then, public endpoints (`/feeds/nearby`, `/deals/:id`, `/search`, `/feeds/trending`) work unauthenticated; personalized + action endpoints need the token.
- **Services:** remote preference/action/search/push-registration/subscription/analytics services calling `/v1/me*`, `/v1/deals/:id/*`, `/v1/search`, `/v1/push-tokens`, `/v1/subscriptions/apple/sync`, `/v1/events`.
- **Location:** Core Location → `DealQuery`; MapKit already on device.
- **Push:** APNs registration → FCM token → `POST /v1/push-tokens`; deep-link handling from notification payloads.
- **StoreKit 2:** purchase → send signed transaction to `/v1/subscriptions/apple/sync`; gate Dealy+ UI on `GET /v1/me/entitlements` (server truth).

## Contract
The committed [`openapi.json`](./openapi.json) (38 paths) is the source of truth; Swagger UI at `/docs` when the API runs. Money is decimal dollars in JSON; dates are ISO-8601.
