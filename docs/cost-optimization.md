# Cost Optimization

## Core Rule

Process content once and serve the result many times.

## Controls

```mermaid
flowchart TD
  Region[Regional inventory] --> Healthy{Healthy?}
  Healthy -- yes --> NoCrawl[Do not crawl]
  Healthy -- no --> Source[Fetch sources]
  Source --> Hash[Hash content]
  Hash --> Seen{Hash seen?}
  Seen -- yes --> NoAI[Skip Gemini]
  Seen -- no --> PromptCache{Prompt cache hit?}
  PromptCache -- yes --> Reuse[Reuse AI output]
  PromptCache -- no --> Flash[Gemini Flash]
  Flash --> Ambiguous{Ambiguous?}
  Ambiguous -- yes --> Pro[Gemini Pro]
  Ambiguous -- no --> Store[Store output]
```

## Estimated Costs

Actual pricing depends on vendor plan and token/page sizes. The implemented controls reduce cost drivers:

- Firecrawl cost scales with scheduled source refreshes, not user traffic.
- Gemini cost scales with new or changed content hashes, not user traffic.
- Flash should handle most extraction/classification calls.
- Pro should be rare and limited to low-confidence verification.

For a small Atlanta pilot with 100 pages per run and 4 maximum discovery runs per day, the hard cap is 400 Firecrawl pages per day before vendor-side limits. Gemini calls should be lower than Firecrawl pages when content hashes and prompt cache hits are working.

