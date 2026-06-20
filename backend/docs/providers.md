# Providers & Credentials Checklist

Honest classification of every external integration: what it's for, whether it's
usable, what credential it needs, and where to get it. **No secrets in the repo.**
Every provider ships an interface + a deterministic local/test adapter so unrelated
work continues when credentials are absent.

## Legend
- ✅ **Public API available** — usable now with a key.
- 🟡 **Partner/affiliate, approval required** — implement interface, await approval.
- 🟠 **Manual/admin only** — no API; ingest via admin endpoints / approved feeds.
- 🔴 **Unavailable / prohibited** — no public API, or ToS forbids aggregation/scraping. **Do not build.**

## Infrastructure credentials (needed for deploy/verify)

| Service | Env var(s) | Where to get | Scopes / notes | Status |
|---|---|---|---|---|
| Supabase project | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `DIRECT_DATABASE_URL` | supabase.com → project → Settings → API/Database | secret key server-only; publishable key may ship to app only if direct client use is intended | Awaiting credentials (local Docker Postgres used to verify) |
| Redis | `REDIS_URL` | Railway Redis plugin | private network URL | Local Docker used to verify |
| Meilisearch | `MEILISEARCH_HOST`, `MEILISEARCH_MASTER_KEY` | Railway/Meilisearch Cloud | master key server-only | Local Docker used to verify |
| Sentry | `SENTRY_DSN` | sentry.io → project | DSN is publishable | Awaiting credentials |
| PostHog | `POSTHOG_API_KEY`, `POSTHOG_HOST` | posthog.com | project API key | Awaiting credentials |
| Google Maps Platform | `GOOGLE_MAPS_SERVER_API_KEY` | console.cloud.google.com → Maps Platform | **server key restricted by IP/API**: Geocoding, Places. Not exposed to app | Awaiting credentials |
| Firebase (FCM) | `FIREBASE_PROJECT_ID`, service-account JSON via secret ref | console.firebase.google.com → Project settings → Service accounts | Cloud Messaging; upload APNs auth key (.p8) in Firebase | Awaiting credentials + Apple keys |
| Apple Push / App Store | `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_BUNDLE_ID`, `APPLE_PRIVATE_KEY` (secret ref), `APPLE_APPSTORE_ENV` | App Store Connect → Users and Access → Integrations (App Store Connect API key); APNs Auth Key in Certificates | App Store Server API + APNs; bundle id `com.dealy.app` | Awaiting Apple Developer Program enrollment |
| Stripe (business only) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | dashboard.stripe.com | server-only; **not** for consumer Dealy+ | Awaiting credentials (optional) |

## Deal/event content providers

| Provider | Category | Classification | Reality |
|---|---|---|---|
| **Editorial (curated)** | Food / Groceries | ✅ Built-in (no key) | Hand-curated Atlanta food/grocery deals (`providers/editorial-deals.ts`) — **carries the no-API pilot categories**. Deterministic `verify()` against the checked-in list. Replace records with real curated deals; superseded by Kroger/affiliate feeds as they land. NOT scraping. |
| **Ticketmaster Discovery API** | Events | ✅ Public API | Documented public API (key from developer.ticketmaster.com). **First real provider; re-verifiable** via `verify()` (404→invalid, past→expired). Rate-limited; attribution required. |
| **Eventbrite** | Events | 🟡 Partner | Public API exists but **search/discovery of others' events was restricted**; only your own org's events are reliably available. Implement interface, gate behind approval. |
| DoorDash / Uber Eats / Grubhub | Food | 🔴 Unavailable | No public consumer "deals" API; merchant/Drive APIs are partner-only and don't expose promos for aggregation. Scraping prohibited by ToS. **Do not build.** Use admin/business ingestion instead. |
| Walmart / Target / Best Buy | Retail | 🟠/🟡 | Walmart/BestBuy have affiliate/product APIs (approval, affiliate program); not general "deals." Target has no public API. Treat as affiliate-feed (approval) or manual. |
| Kroger | Grocery | 🟡 Partner | Kroger Developer API exists (products/promotions) but requires registration/approval and store scoping. Implement interface, await approval. |
| Publix | Grocery | 🔴 | No public API. Manual/admin only. |
| GSU / Georgia Tech / KSU / UGA | Student | 🟠 Manual | Universities don't publish structured deal APIs. Ingest via admin entry, approved RSS/feeds, or business submissions. Collect no unnecessary student PII; verification provider is replaceable and minimizes retained data. |

**Rule:** never fabricate an endpoint, never scrape a prohibited source, never bypass anti-bot. Anything not ✅/🟡-with-approval is **manual/admin ingestion** + the deterministic **fixture provider** for dev/tests.

## Apple / Firebase account actions owned by the repo owner
These require the Apple Developer account holder and cannot be done from this repo:
enroll in Apple Developer Program; create the App ID `com.dealy.app`; enable Push + Sign in with Apple capabilities; create APNs Auth Key; create App Store Connect API key; create StoreKit subscription products; create Firebase project + upload APNs key. Tracked in `testflight.md`.
