# Security

## Posture
- **AuthN:** Supabase JWTs verified server-side against the project JWKS (RS256/ES256), audience-checked, issuer-checked when configured. Fails closed. No trust in unverified claims.
- **AuthZ:** global `AuthGuard` (every route private unless `@Public()`), `RolesGuard` with `@Roles()`. Roles live in the server-controlled `user_roles` table — **never** read from JWT/user metadata. Ownership is enforced by scoping every query to `req.authUser.id` (no tamperable id params on `/me/*`).
- **Secrets:** server-only keys (Supabase service-role, Meili master, Firebase SA, Apple keys, Stripe) never reach the client; `.env` git-ignored; CI gitleaks scan. Pino logs redact `authorization`/`cookie`/`*.password`/`*.token`.
- **Money:** integer minor units; never floating point.
- **Validation:** global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform). Search filter-injection guarded (category slug regex). UUID params via `ParseUUIDPipe`.
- **Errors:** uniform envelope; 5xx never leak internals (generic message + requestId), logged + Sentry.
- **Idempotency:** `Idempotency-Key` for swipes; composite-PK upserts for saves/watches/redemptions; `subscription_events` + notification `dedupeKey` dedupe replays.
- **SSRF:** image-import (future) must validate/allowlist URLs; provider `fetch` calls go to fixed, documented hosts only.
- **Webhooks/subscriptions:** Apple App Store JWS is verified by **validating the full x5c certificate chain to Apple's root CA** (`APPLE_ROOT_CA_BASE64`) AND the leaf signature; the verifier **fails closed** (grants nothing) when the root isn't configured. A transaction's ownership is bound on first sync and is **immutable** — it can never be reassigned to whoever submits its JWS (optionally bound to `appAccountToken`).
- **Privacy:** analytics sanitize PII/secrets/coordinates; account deletion soft-deletes + rejects deleted-account tokens (PII purge job is a worker follow-up); location history minimized (we store campus/coords on deals, not user GPS trails).

## Tested security behaviors (e2e)
JWT rejection (401) · ownership isolation (user A can't see B's saved/watched/notifications) · admin/role escalation blocked (non-admin → 403; roles from DB only) · `forbidNonWhitelisted` (400) · invalid coordinates / excessive radius (400) · duplicate swipe (idempotent) · account-deletion → token rejected · search filter-injection (400) · subscription event idempotency · entitlement derived server-side (never client boolean) · uniform error envelope.

## RLS (Supabase) — policies shipped, apply on Supabase
Concrete policies live in [`prisma/rls/enable-rls.sql`](../prisma/rls/enable-rls.sql) — **apply them on Supabase** (`psql "$DIRECT_DATABASE_URL" -f prisma/rls/enable-rls.sql`). They: enable RLS on every table; restrict user-owned tables to `user_id = current_app_user_id()` (resolving `auth.uid()` → internal id), not merely `authenticated`; **deny-all** internal/admin tables (only the service role bypasses); make catalog tables read-only-public. The API uses the service role so it keeps working. Run the Supabase security advisor afterwards. (RLS uses `auth.uid()`, a Supabase function, so it's applied in Supabase, not in the local Prisma migration chain.)

## Threats explicitly handled vs. deferred
Handled: token forgery, privilege escalation, IDOR/ownership, injection (SQL via Prisma/parameterized raw SQL; Meili filter), secret leakage, replay/duplicate, generic error disclosure, **Apple JWS chain validation + transaction-ownership binding**, **RLS ownership policies**.
Still deferred (clearly not done): Stripe webhook signature verification (business billing, when enabled), per-IP rate limiting (`@fastify/rate-limit` + Redis store), SSRF allowlist for image import, account-deletion PII purge job, Apple root-CA OCSP/CRL revocation checks.
