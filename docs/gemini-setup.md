# Gemini Setup

## Environment

Set these backend-only variables:

```env
GOOGLE_GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_REASONING_MODEL=gemini-2.5-pro
AI_CACHE_TTL_HOURS=24
AI_ENABLED=true
```

## Runtime Role

Gemini interprets extracted content. It does not discover sources and it should not receive full websites when extracted page text is enough.

```mermaid
flowchart TD
  Extracted[Extracted page content] --> Cache{AI cache hit?}
  Cache -- yes --> Reuse[Reuse cached JSON]
  Cache -- no --> Flash[Gemini Flash structured JSON]
  Flash --> Confidence{Low confidence or conflict?}
  Confidence -- yes --> Pro[Gemini Pro reasoning]
  Confidence -- no --> Store[Store classification]
  Pro --> Store
```

## Structured Outputs

Gemini responses are constrained to JSON for:

- deal extraction
- deal classification
- merchant normalization
- duplicate detection
- confidence scoring
- user-facing summaries
- verification reasoning

## Model Selection

Use `GEMINI_MODEL` for default work. Use `GEMINI_REASONING_MODEL` only when confidence is low, source evidence conflicts, or verification needs heavier reasoning.

