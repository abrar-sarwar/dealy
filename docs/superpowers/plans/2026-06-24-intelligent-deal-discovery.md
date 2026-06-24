# Intelligent Deal Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production backend infrastructure for Firecrawl/Gemini-powered regional deal discovery without making user requests wait on scraping or AI.

**Architecture:** Extend the existing NestJS/Prisma backend with typed config, Firecrawl and Gemini service boundaries, regional inventory trigger logic, content/AI caching primitives, ranking math, migrations, and documentation. The mobile feed contract remains cache-first and unchanged.

**Tech Stack:** NestJS, Prisma, PostGIS, Zod, Jest, native `fetch`, Firecrawl HTTP API, Gemini Interactions/generateContent-compatible structured JSON calls.

## Global Constraints

- No user request may synchronously call Firecrawl or Gemini.
- Gemini interprets extracted content only; it does not discover sources.
- Firecrawl/Gemini credentials are server-only environment variables.
- Flash is the default Gemini model; Pro is only for ambiguous or conflicting cases.
- Existing production behavior and feed contracts must remain intact.
- Tests are written before implementation for behavior-bearing code.

---

### Task 1: Config and Environment

Add `.env.example` entries, Zod validation, and typed config accessors for Firecrawl, Gemini, and discovery settings.

### Task 2: Cost Primitives

Add pure hashing, AI cache key, crawl trigger, and ranking helpers with unit tests.

### Task 3: Firecrawl Service

Add typed Firecrawl client/service supporting scrape, crawl, and extract with retries, timeout, rate limiting, logging, and structured errors.

### Task 4: Gemini Service

Add typed Gemini client/service supporting structured JSON deal extraction, classification, merchant normalization, duplicate detection, summaries, confidence scoring, and verification reasoning.

### Task 5: Discovery Orchestration

Add discovery module/service interfaces for regional inventory checks, cache-first flow decisions, and background pipeline orchestration.

### Task 6: Database Migration

Add Prisma models and SQL migration for regional inventories, content hashes, deal candidates, AI classifications, and AI cache.

### Task 7: Documentation

Add setup, architecture, cost optimization, and scaling docs with Mermaid diagrams.

### Task 8: Verification

Run focused Jest tests, typecheck, and report any unavailable DB-backed verification honestly.

