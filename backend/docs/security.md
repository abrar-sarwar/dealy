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
- **Webhooks:** Apple App Store notifications are JWS-verified before mutating state (chain-pinning to Apple root is the remaining hardening — see `progress.md` Phase 9a).
- **Privacy:** analytics sanitize PII/secrets/coordinates; account deletion soft-deletes + rejects deleted-account tokens (PII purge job is a worker follow-up); location history minimized (we store campus/coords on deals, not user GPS trails).

## Tested security behaviors (e2e)
JWT rejection (401) · ownership isolation (user A can't see B's saved/watched/notifications) · admin/role escalation blocked (non-admin → 403; roles from DB only) · `forbidNonWhitelisted` (400) · invalid coordinates / excessive radius (400) · duplicate swipe (idempotent) · account-deletion → token rejected · search filter-injection (400) · subscription event idempotency · entitlement derived server-side (never client boolean) · uniform error envelope.

## RLS (Supabase)
RLS is enabled on every API-exposed table as defense-in-depth (the API already enforces authz with the service connection). Policies are ownership-based (`user_id = auth.uid()`), not merely `authenticated`. Internal/operational tables stay in an unexposed schema where practical. Run the Supabase security advisor after applying the schema.

## Threats explicitly handled vs. deferred
Handled: token forgery, privilege escalation, IDOR/ownership, injection (SQL via Prisma/parameterized raw SQL; Meili filter), secret leakage, replay/duplicate, generic error disclosure. Deferred/hardening: full Apple JWS chain pinning, Stripe webhook signature verification (business billing, when enabled), per-IP rate limiting (add `@fastify/rate-limit` + Redis store), SSRF allowlist for image import.
