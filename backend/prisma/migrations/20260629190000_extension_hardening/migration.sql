-- Extension / function hardening (Part 1 — revokes only, low risk).
--
-- Addresses Supabase security-advisor WARNs:
--   * anon_security_definer_function_executable          — st_estimatedextent(*)
--   * authenticated_security_definer_function_executable — st_estimatedextent(*)
--
-- NOTE: the fuzzystrmatch extension is intentionally NOT dropped here. Although
-- no application code calls it, `postgis_tiger_geocoder` (installed in the
-- `tiger` schema on Supabase) hard-depends on it, so it cannot be dropped
-- without removing a PostGIS-family extension. That is deliberately out of scope
-- ("do not touch PostGIS"); the extension_in_public warnings for fuzzystrmatch
-- and postgis remain deferred.
--
-- Scope is minimal: NO postgis move, NO search_path change, NO touch to
-- geography/geometry columns, indexes, spatial_ref_sys, or any function body.

-- Least-privilege on the PostGIS SECURITY DEFINER function st_estimatedextent.
-- These are extension-owned (postgis); we only revoke the PostgREST-exposed
-- EXECUTE grant so anon/authenticated cannot call it via /rest/v1/rpc. The table
-- owner role (postgres, used by Prisma) can always execute regardless, and the
-- app never calls this function, so the backend is unaffected. Reversible via
-- GRANT (see prisma/drafts/2026-06-29_extension_hardening.DRAFT.sql rollback).
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text)                FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text)          FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM anon, authenticated, public;
