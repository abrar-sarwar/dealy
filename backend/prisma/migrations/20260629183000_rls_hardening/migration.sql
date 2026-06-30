-- RLS hardening for the Supabase Data API (PostgREST) attack surface.
--
-- WHY THIS EXISTS
-- Supabase exposes every table in `public` through the auto-generated Data API
-- (PostgREST), reachable with the project's anon/publishable key. That key ships
-- inside the iOS app, so it is effectively public. With RLS disabled, anyone
-- holding the anon key can SELECT/INSERT/UPDATE/DELETE every row directly via
-- https://<ref>.supabase.co/rest/v1/<table> — bypassing the backend entirely.
--
-- INTENDED DATA PATH
-- Dealy's NestJS backend talks to Postgres through Prisma using the `postgres`
-- role (the pooler user `postgres.<ref>`). That role OWNS these tables (they were
-- created by Prisma migrations). A table owner BYPASSES row-level security by
-- default (we deliberately use ENABLE, not FORCE, RLS), so enabling RLS here does
-- NOT affect the backend — Prisma keeps full access.
--
-- SECURITY STANCE: DEFAULT DENY
-- Enabling RLS with ZERO policies means the `anon` and `authenticated` PostgREST
-- roles match no permissive policy and therefore see/modify NO rows. That is the
-- desired default-deny posture: the Data API is closed for these tables. If a
-- specific table ever needs client-side access, add an explicit, narrowly-scoped
-- CREATE POLICY in a FUTURE migration — never by loosening this one.
--
-- SCOPE / EXCLUSIONS
--   * public._prisma_migrations — Prisma's own migration ledger, never an API
--     surface; intentionally left untouched.
--   * public.spatial_ref_sys    — PostGIS reference data owned by the extension,
--     not application data and not owner-alterable here; intentionally excluded.
--     (Supabase's advisor may still list it; this is a known PostGIS exception.)
--
-- IDEMPOTENT: ENABLE ROW LEVEL SECURITY is a no-op on an already-enabled table,
-- so re-running `prisma migrate deploy` is safe.
--
-- NOTE: any NEW application table added later must enable RLS in its own
-- migration, or the Data API will expose it again.

ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_category_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watched_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regional_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_staple_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_baskets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_basket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_store_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_deal_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_basket_saves ENABLE ROW LEVEL SECURITY;
