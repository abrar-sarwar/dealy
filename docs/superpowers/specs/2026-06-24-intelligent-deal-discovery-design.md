# Intelligent Deal Discovery Foundation Design

## Goal

Build Dealy's production backend foundation for low-cost, regional deal discovery. Users should receive cached nearby deals immediately while Firecrawl and Gemini run in background workflows that refresh shared regional inventories.

## Architecture

The backend remains the source of truth. Firecrawl discovers and extracts web content, Gemini interprets normalized extracted content, Prisma/Postgres stores inventory and processing metadata, and feed APIs continue reading cached deals from Supabase-backed Postgres. Normal app opens never call Firecrawl or Gemini inline.

The existing crawler subsystem stays in place and is extended through explicit service boundaries:

- `src/services/firecrawl` owns scrape/crawl/extract API calls, retries, timeouts, rate limiting, and request metrics.
- `src/services/gemini` owns structured JSON AI calls for extraction, classification, normalization, duplicate analysis, summaries, scoring, and verification reasoning.
- `src/discovery` owns region inventory health, trigger decisions, content hashing, AI cache keys, ranking math, and pipeline orchestration.
- Prisma stores durable discovery state in `regional_inventories`, `deal_candidates`, `ai_classifications`, `content_hashes`, and `ai_cache`.

## Data Flow

1. App requests nearby deals.
2. Backend queries existing published, verified inventory.
3. If the region has enough fresh deals, the response is served immediately.
4. If inventory is thin or stale, the backend can enqueue a background discovery run.
5. Firecrawl fetches source content for shared regional sources.
6. The backend hashes normalized content. Known hashes skip Gemini entirely.
7. Gemini receives extracted text only, using structured JSON output.
8. Candidates, classifications, cache entries, and deal rows are persisted.
9. Ranking uses distance, discount, freshness, verification, popularity, and confidence.

## Cost Controls

Cost reduction is a first-class requirement:

- Region inventories are shared by many users.
- Firecrawl runs only when an inventory is thin, stale, manually refreshed, or receives a new source.
- Content hashes prevent repeated AI processing for unchanged pages.
- AI prompt/output cache reuses identical classifications inside `AI_CACHE_TTL_HOURS`.
- Gemini Flash is the default model.
- Gemini Pro is reserved for ambiguous extraction, verification conflicts, and low-confidence reasoning.

## Schema

Existing tables retained: `crawl_sources`, `crawl_runs`, `crawl_failures`.

New tables:

- `regional_inventories`: regional health and refresh state.
- `content_hashes`: content hash registry keyed by source URL and hash.
- `deal_candidates`: raw normalized deal candidates before final publication.
- `ai_classifications`: structured AI outputs and confidence metadata.
- `ai_cache`: prompt/result cache with expiry and model metadata.

## Safety

All new tables are backend-owned operational tables. They are not part of the public mobile Data API contract. RLS should be enabled in Supabase deployment SQL if these tables are exposed through PostgREST. The Nest backend uses Prisma with server-side credentials and keeps Firecrawl/Gemini keys out of the iOS app.

## Verification

Implementation should include unit tests for:

- config validation and typed config access
- Firecrawl retry/timeout/rate-limit behavior
- Gemini structured JSON parsing and model selection
- content hash and AI cache decisions
- discovery trigger rules
- ranking score math

