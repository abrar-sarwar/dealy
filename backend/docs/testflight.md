# TestFlight & App Store — owner checklist

Steps only the **Apple account holder** can do (they need your Apple ID, payment,
and legal acceptance). The app is iOS 17+, bundle id **`com.dealy.app`**.

## A. Apple Developer + App Store Connect
1. Enroll in the **Apple Developer Program** ($99/yr) at developer.apple.com.
2. App Store Connect → **Apps → +** → New App. Platform iOS, bundle id `com.dealy.app`, name "Dealy", primary language, SKU.
3. **Certificates, Identifiers & Profiles → Identifiers**: confirm the `com.dealy.app` App ID; enable capabilities **Push Notifications** and **Sign in with Apple**.

## B. Capabilities + credentials (feed these back into the backend env)
4. **APNs Auth Key**: Identifiers → Keys → **+** → Apple Push Notifications service (.p8). Download once. Upload it into **Firebase** (next step) — FCM delivers to APNs.
5. **Firebase**: create a project at console.firebase.google.com → add an iOS app (`com.dealy.app`) → upload the APNs .p8 (Cloud Messaging settings). Download `GoogleService-Info.plist` for the iOS app. Create a **service account** (Project settings → Service accounts → generate key) → base64 it → backend `FIREBASE_SERVICE_ACCOUNT_BASE64`; `FIREBASE_PROJECT_ID`.
6. **App Store Server API key**: Users and Access → Integrations → App Store Connect API → generate key (.p8). → backend `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_BASE64`, `APPLE_BUNDLE_ID=com.dealy.app`, `APPLE_APPSTORE_ENV`.
7. **App Store Server Notifications v2**: set the production + sandbox URL to `https://api.dealy.app/v1/webhooks/apple`.
8. **StoreKit subscription products** (Dealy+): App Store Connect → Subscriptions → create a group + products (e.g. `dealy.plus.monthly` $2.99 student / $5.99 regular). Match the product ids the iOS StoreKit code requests.
9. **Sign in with Apple** + **Google Sign-In**: configure in Supabase Auth (providers) using the Apple Services ID / Google OAuth client; the iOS app uses the Supabase Auth SDK.

## C. Xcode project config (in `project.yml` / target settings)
10. Set the bundle id `com.dealy.app`, signing team, and capabilities: Push Notifications, Sign in with Apple, Associated Domains (`applinks:dealy.app` if using universal links).
11. Add Info.plist usage strings: `NSLocationWhenInUseUsageDescription` ("Dealy uses your location to show deals nearby"), and a user-notifications prompt rationale in-app.
12. Add the **Privacy Manifest** (`PrivacyInfo.xcprivacy`) declaring data types collected (coarse location, identifiers) and reasons.
13. Add `GoogleService-Info.plist`; set the API base URL via `.xcconfig` (`DEALY_API_ENV=production`) — do not commit secrets.

## D. Ship to TestFlight
14. Xcode → select "Any iOS Device" → **Product → Archive**.
15. Organizer → **Distribute App → App Store Connect → Upload**.
16. App Store Connect → TestFlight → wait for processing → add **internal testers** (your team) / external testers (needs a beta review).
17. Install via the TestFlight app on a physical iPhone. Verify the vertical slice end-to-end (sign in → nearby feed → swipe/save → notifications).

## E. App Store submission
18. Complete **App Privacy** disclosures (data collection answers), age rating, category.
19. Provide screenshots (6.7"/6.9" + others), description, keywords, support URL, privacy policy URL.
20. Submit for **App Review**. (No purchases are charged in sandbox; live IAP requires the paid agreements in App Store Connect → Agreements, Tax, and Banking.)

> Do not claim the app is "submitted" until you actually submit it in App Store Connect — this repo can't do these steps for you.

## Backend ↔ Apple/Firebase env summary
`FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_BASE64`, `APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_BASE64`, `APPLE_APPSTORE_ENV` — see [`.env.example`](../.env.example) and `providers.md`.
